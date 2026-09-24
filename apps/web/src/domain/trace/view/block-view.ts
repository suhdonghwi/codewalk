import { raisedExceptions, statementStates } from "../views.ts";

import {
  lineContaining,
  sourceLines,
  trimCommonIndent,
} from "./source-lines.ts";
import { siteLocs, spansForLine } from "./spans.ts";

import type { SourceLine } from "./source-lines.ts";
import type { Span, SpanContext } from "./spans.ts";
import type { Token } from "./tokens.ts";
import type {
  RecordedValue,
  Site,
  Trace,
  TraceNode,
  ValueChunk,
} from "@codewalk/trace";

export interface InlineSegment {
  stream: "stdout" | "stderr";
  text: string;
}

interface StateValue {
  name: string;
  label: string | null;
  entry: RecordedValue;
}

interface StateRow {
  label: string;
  values: StateValue[];
}

export interface Line {
  number: number;
  spans: Span[];
  inputs: ValueChunk[];
  changes: ValueChunk[];
  output: InlineSegment[] | null;
  exception: string | null;
  after: StateRow[];
}

export interface BlockView {
  groups: Line[][];
}

function outputsByLine(
  trace: Trace,
  sites: Site[],
  lines: SourceLine[],
): Map<number, InlineSegment[]> {
  const indexesByLine = new Map<number, number[]>();

  for (const site of sites) {
    if (site.outputs.length === 0) continue;
    const line = lineContaining(lines, site.loc.end);

    if (line === null) continue;
    const indexes = indexesByLine.get(line) ?? [];
    indexes.push(...site.outputs);
    indexesByLine.set(line, indexes);
  }

  const outputs = new Map<number, InlineSegment[]>();

  for (const [line, indexes] of indexesByLine) {
    indexes.sort((left, right) => left - right);
    const segments: InlineSegment[] = [];

    for (const index of indexes) {
      const output = trace.outputs[index];

      if (output !== undefined) {
        segments.push({ stream: output.stream, text: output.text });
      }
    }

    const last = segments.at(-1);

    if (last !== undefined && last.text.endsWith("\n")) {
      last.text = last.text.slice(0, -1);
    }

    outputs.set(line, segments);
  }

  return outputs;
}

function indentAt(source: string, lines: SourceLine[], start: number): string {
  const line = lines.find(({ from, to }) => from <= start && start <= to);

  return line === undefined ? "" : source.slice(line.from, start);
}

interface PlacedValues {
  changes: Map<number, ValueChunk[]>;
  after: Map<number, StateRow[]>;
}

function placeValues(
  trace: Trace,
  block: TraceNode,
  lines: SourceLine[],
): PlacedValues {
  const source = trace.source.text;
  const changes = new Map<number, ValueChunk[]>();
  const after = new Map<number, StateRow[]>();

  const addAfter = (end: number, row: StateRow): void => {
    const line = lineContaining(lines, end);

    if (line !== null) after.set(line, [...(after.get(line) ?? []), row]);
  };

  for (const statement of block.children) {
    const { loc } = statement;
    const indent = indentAt(source, lines, loc.start);
    const returned = statement.returned;

    if (returned !== null && !returned.literal) {
      addAfter(loc.end, {
        label: `${indent}(returned)`,
        values: [{ name: "returned", label: null, entry: returned }],
      });
    }

    const values = statement.values.filter(({ literal }) => !literal);

    if (values.length === 0) continue;

    const iteration = statement.children.find(
      (child) => child.loc.role === "block" && child.loc.parent === loc.id,
    );

    if (iteration === undefined) {
      const line = lineContaining(lines, loc.end);

      if (line !== null) {
        changes.set(line, [...(changes.get(line) ?? []), ...values]);
      }

      continue;
    }

    addAfter(iteration.loc.end, {
      label: `${indent}(after)`,
      values: values.map((entry) => ({
        name: entry.name,
        label: `${entry.name} →`,
        entry,
      })),
    });
  }

  return { changes, after };
}

function exceptionByLine(
  block: TraceNode,
  lines: SourceLine[],
): Map<number, string> {
  const result = new Map<number, string>();

  for (const { stmt, exc } of raisedExceptions(block)) {
    const line = lineContaining(lines, stmt.loc.end);

    if (line !== null) result.set(line, exc);
  }

  return result;
}

export function hasChips(line: Line): boolean {
  return (
    line.changes.length > 0 || line.output !== null || line.exception !== null
  );
}

function runs(lines: Line[]): Line[][] {
  const groups: Line[][] = [];

  for (const [index, line] of lines.entries()) {
    const previous = lines[index - 1];
    const current = groups.at(-1);

    if (
      current !== undefined &&
      previous !== undefined &&
      previous.after.length === 0 &&
      hasChips(previous) === hasChips(line)
    ) {
      current.push(line);
    } else {
      groups.push([line]);
    }
  }

  return groups;
}

export function buildBlockView(
  trace: Trace,
  block: TraceNode,
  tokens: Token[],
): BlockView {
  const source = trace.source.text;
  const { loc } = block;

  const lines = trimCommonIndent(
    source,
    sourceLines(source, loc.start, loc.end),
  );

  const nestedBlocks = trace.locs.filter(
    (candidate) =>
      candidate.id !== loc.id &&
      candidate.role === "block" &&
      candidate.start >= loc.start &&
      candidate.end <= loc.end,
  );

  const outputs = outputsByLine(trace, block.sites, lines);
  const exceptions = exceptionByLine(block, lines);
  const { changes, after } = placeValues(trace, block, lines);

  const context: SpanContext = {
    source,
    tokens,
    states: statementStates(trace, block),
    nestedBlocks,
    sites: siteLocs(block.sites),
    values: block.values.flatMap((chunk) =>
      chunk.loc === null ? [] : [{ end: chunk.loc.end, value: chunk }],
    ),
  };

  const inputs = block.values.filter((chunk) => chunk.loc === null);

  return {
    groups: runs(
      lines.map((line, index) => ({
        number: line.number,
        spans: spansForLine(context, line),
        inputs: index === 0 ? inputs : [],
        changes: changes.get(line.number) ?? [],
        output: outputs.get(line.number) ?? null,
        exception: exceptions.get(line.number) ?? null,
        after: after.get(line.number) ?? [],
      })),
    ),
  };
}
