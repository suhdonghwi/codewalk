import {
  blockSites,
  exceptionOrigin,
  requireBlock,
  statementStates,
} from "../views.ts";

import {
  lineContaining,
  sourceLines,
  trimCommonIndent,
} from "./source-lines.ts";
import { siteLocs, spansForLine } from "./spans.ts";

import type { SourceLine } from "./source-lines.ts";
import type { LocatedState, Span, SpanContext } from "./spans.ts";
import type { Token } from "./tokens.ts";
import type { Site } from "../views.ts";
import type {
  LocId,
  NodeId,
  Trace,
  TraceNode,
  ValueChunk,
} from "@codewalk/trace";

export interface InlineSegment {
  stream: "stdout" | "stderr";
  text: string;
}

export interface Line {
  number: number;
  spans: Span[];
  start: ValueChunk[];
  changes: ValueChunk[];
  output: InlineSegment[] | null;
  exception: string | null;
  loopEnd: LoopEnd | null;
}

interface LoopEnd {
  indent: string;
  changes: ValueChunk[];
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
    const loc = trace.header.locs[site.loc];

    if (loc === undefined) continue;
    const line = lineContaining(lines, loc.end);

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

interface PlacedChanges {
  changes: Map<number, ValueChunk[]>;
  loopEnds: Map<number, LoopEnd>;
}

function iterationLoc(trace: Trace, statement: TraceNode): LocId | null {
  for (const child of statement.children) {
    const loc = trace.nodes[child]?.loc;

    if (loc !== undefined && trace.header.locs[loc]?.role === "block") {
      return loc;
    }
  }

  return null;
}

function descendsFrom(trace: Trace, locId: LocId, root: LocId): boolean {
  let current: LocId | null = locId;

  while (current !== null) {
    if (current === root) return true;
    current = trace.header.locs[current]?.parent ?? null;
  }

  return false;
}

function bodyEnd(trace: Trace, iteration: LocId): number {
  return trace.header.locs.reduce(
    (end, loc) =>
      loc.parent !== null && descendsFrom(trace, loc.parent, iteration)
        ? Math.max(end, loc.end)
        : end,
    0,
  );
}

function placeChanges(
  trace: Trace,
  node: TraceNode,
  source: string,
  lines: SourceLine[],
): PlacedChanges {
  const changes = new Map<number, ValueChunk[]>();
  const loopEnds = new Map<number, LoopEnd>();

  for (const child of node.children) {
    const statement = trace.nodes[child];

    const loc =
      statement === undefined ? undefined : trace.header.locs[statement.loc];

    if (statement === undefined || loc?.role !== "stmt") continue;

    if (statement.values.length === 0) continue;
    const iteration = iterationLoc(trace, statement);

    if (iteration === null) {
      const line = lineContaining(lines, loc.end);

      if (line === null) continue;
      changes.set(line, [...(changes.get(line) ?? []), ...statement.values]);
      continue;
    }

    const header = lines.find(
      (line) => line.from <= loc.start && loc.start <= line.to,
    );

    const line = lineContaining(lines, bodyEnd(trace, iteration));

    if (header === undefined || line === null) continue;

    loopEnds.set(line, {
      indent: source.slice(header.from, loc.start),
      changes: [...(loopEnds.get(line)?.changes ?? []), ...statement.values],
    });
  }

  return { changes, loopEnds };
}

function exceptionByLine(
  trace: Trace,
  block: NodeId,
  node: TraceNode,
  lines: SourceLine[],
): Map<number, string> {
  const result = new Map<number, string>();
  const origin = exceptionOrigin(trace);

  if (origin?.block !== block || origin.stmt === null || node.exc === null) {
    return result;
  }

  const statement = trace.nodes[origin.stmt];

  const loc =
    statement === undefined ? undefined : trace.header.locs[statement.loc];

  const line = loc === undefined ? null : lineContaining(lines, loc.end);

  if (line !== null) result.set(line, node.exc);

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
      previous.loopEnd === null &&
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
  block: NodeId,
  tokens: Token[],
): BlockView {
  const { node, loc, source } = requireBlock(trace, block);

  const lines = trimCommonIndent(
    source,
    sourceLines(source, loc.start, loc.end),
  );

  const sites = blockSites(trace, block);

  const states: LocatedState[] = statementStates(trace, block).flatMap(
    ({ loc: locId, state }) => {
      const statementLoc = trace.header.locs[locId];

      return statementLoc === undefined ? [] : [{ loc: statementLoc, state }];
    },
  );

  const nestedBlocks = trace.header.locs.filter(
    (candidate, locId) =>
      locId !== node.loc &&
      candidate.role === "block" &&
      candidate.file === loc.file &&
      candidate.start >= loc.start &&
      candidate.end <= loc.end,
  );

  const outputs = outputsByLine(trace, sites, lines);
  const exceptions = exceptionByLine(trace, block, node, lines);
  const { changes, loopEnds } = placeChanges(trace, node, source, lines);

  const context: SpanContext = {
    source,
    tokens,
    states,
    nestedBlocks,
    sites: siteLocs(trace, sites),
    values: node.values.flatMap((chunk) => {
      const anchor =
        chunk.loc === null ? undefined : trace.header.locs[chunk.loc];

      return anchor === undefined ? [] : [{ end: anchor.end, value: chunk }];
    }),
  };

  const inputs = node.values.filter(({ loc }) => loc === null);

  return {
    groups: runs(
      lines.map((line, index) => ({
        number: line.number,
        spans: spansForLine(context, line),
        start: index === 0 ? inputs : [],
        changes: changes.get(line.number) ?? [],
        output: outputs.get(line.number) ?? null,
        exception: exceptions.get(line.number) ?? null,
        loopEnd: loopEnds.get(line.number) ?? null,
      })),
    ),
  };
}
