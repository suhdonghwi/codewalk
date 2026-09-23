import {
  blockSites,
  exceptionOrigin,
  requireBlock,
  statementStates,
} from "../views.ts";

import { lineContaining, sourceLines } from "./source-lines.ts";
import { siteLocs, spansForLine } from "./spans.ts";

import type { SourceLine } from "./source-lines.ts";
import type { LocatedState, Span, SpanContext } from "./spans.ts";
import type { Token } from "./tokens.ts";
import type { Site } from "../views.ts";
import type { NodeId, Trace, TraceNode } from "@codewalk/trace";

export interface InlineSegment {
  stream: "stdout" | "stderr";
  text: string;
}

interface LineValue {
  name: string;
  text: string;
}

export interface Line {
  number: number;
  spans: Span[];
  values: LineValue[];
  changes: LineValue[];
  output: InlineSegment[] | null;
  exception: string | null;
}

export interface BlockView {
  lines: Line[];
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

function changesByLine(
  trace: Trace,
  node: TraceNode,
  lines: SourceLine[],
): Map<number, LineValue[]> {
  const changes = new Map<number, LineValue[]>();

  for (const child of node.children) {
    const statement = trace.nodes[child];

    const loc =
      statement === undefined ? undefined : trace.header.locs[statement.loc];

    if (statement === undefined || loc?.role !== "stmt") continue;
    const line = lineContaining(lines, loc.end);

    if (line === null || statement.values.length === 0) continue;
    const entries = changes.get(line) ?? [];

    for (const { name, text } of statement.values) entries.push({ name, text });
    changes.set(line, entries);
  }

  return changes;
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

export function buildBlockView(
  trace: Trace,
  block: NodeId,
  tokens: Token[],
): BlockView {
  const { node, loc, source } = requireBlock(trace, block);
  const lines = sourceLines(source, loc.start, loc.end);
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
  const changes = changesByLine(trace, node, lines);

  const context: SpanContext = {
    source,
    tokens,
    states,
    nestedBlocks,
    sites: siteLocs(trace, sites),
    values: node.values.flatMap(({ loc: locId, text }) => {
      const anchor = locId === null ? undefined : trace.header.locs[locId];

      return anchor === undefined ? [] : [{ end: anchor.end, text }];
    }),
  };

  const blockValues = node.values.flatMap(({ loc: locId, name, text }) =>
    locId === null ? [{ name, text }] : [],
  );

  return {
    lines: lines.map((line, index) => ({
      number: line.number,
      spans: spansForLine(context, line),
      values: index === 0 ? blockValues : [],
      changes: changes.get(line.number) ?? [],
      output: outputs.get(line.number) ?? null,
      exception: exceptions.get(line.number) ?? null,
    })),
  };
}
