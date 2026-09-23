import { blockSites, exceptionOrigin, statementStates } from "../views.ts";

import { requireBlock } from "./block-title.ts";
import { lineContaining, sourceLines } from "./source-lines.ts";
import { siteLocs, spansForLine } from "./spans.ts";

import type { SourceLine } from "./source-lines.ts";
import type { LocatedState, Span, ValueAnchor } from "./spans.ts";
import type { Token } from "./tokens.ts";
import type { Site } from "../views.ts";
import type { NodeId, Trace, TraceNode } from "@codewalk/trace";

export interface InlineOutput {
  segments: { stream: "stdout" | "stderr"; text: string }[];
}

export interface Line {
  number: number;
  spans: Span[];
  output: InlineOutput | null;
  exception: string | null;
}

export interface BlockView {
  lines: Line[];
}

function outputsByLine(
  trace: Trace,
  sites: Site[],
  lines: SourceLine[],
  source: string,
): Map<number, InlineOutput> {
  const indexesByLine = new Map<number, number[]>();

  for (const site of sites) {
    if (site.outputs.length === 0) continue;
    const loc = trace.header.locs[site.loc];

    if (loc === undefined) continue;
    const line = lineContaining(source, lines, loc.end);

    if (line === null) continue;
    const indexes = indexesByLine.get(line) ?? [];
    indexes.push(...site.outputs);
    indexesByLine.set(line, indexes);
  }

  const outputs = new Map<number, InlineOutput>();

  for (const [line, indexes] of indexesByLine) {
    indexes.sort((left, right) => left - right);
    const segments: InlineOutput["segments"] = [];

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

    outputs.set(line, { segments });
  }

  return outputs;
}

function exceptionByLine(
  trace: Trace,
  block: NodeId,
  node: TraceNode,
  lines: SourceLine[],
  source: string,
): Map<number, string> {
  const result = new Map<number, string>();
  const origin = exceptionOrigin(trace);

  if (origin?.block !== block || origin.stmt === null || node.exc === null) {
    return result;
  }

  const statement = trace.nodes[origin.stmt];

  const loc =
    statement === undefined ? undefined : trace.header.locs[statement.loc];

  const line =
    loc === undefined ? null : lineContaining(source, lines, loc.end);

  if (line !== null) result.set(line, node.exc);

  return result;
}

export function buildBlockView(
  trace: Trace,
  block: NodeId,
  tokens: Token[],
): BlockView {
  const { node, loc } = requireBlock(trace, block);
  const source = trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  const lines = sourceLines(source.text, loc.start, loc.end);
  const sites = blockSites(trace, block);
  const clickableSites = siteLocs(trace, sites);

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

  const outputs = outputsByLine(trace, sites, lines, source.text);
  const exceptions = exceptionByLine(trace, block, node, lines, source.text);

  const values: ValueAnchor[] = node.values.flatMap(({ loc: locId, text }) => {
    const anchor = trace.header.locs[locId];

    return anchor === undefined ? [] : [{ end: anchor.end, text }];
  });

  return {
    lines: lines.map((line) => ({
      number: line.number,
      spans: spansForLine(
        source.text,
        line,
        tokens,
        states,
        nestedBlocks,
        clickableSites,
        values,
      ),
      output: outputs.get(line.number) ?? null,
      exception: exceptions.get(line.number) ?? null,
    })),
  };
}
