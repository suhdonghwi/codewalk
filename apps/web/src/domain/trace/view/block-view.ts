import {
  blockSites,
  exceptionOrigin,
  hasOutput,
  statementStates,
} from "@codewalk/trace";

import type {
  Loc,
  LocId,
  NodeId,
  Site,
  StatementState,
  Trace,
  TraceNode,
} from "@codewalk/trace";
import type { Token } from "./tokens.ts";

export interface Span {
  text: string;
  classes: string;
  state: StatementState;
  sites: LocId[];
}

export interface InlineOutput {
  segments: { stream: "stdout" | "stderr"; text: string }[];
}

export interface Line {
  number: number;
  spans: Span[];
  output: InlineOutput | null;
  exception: string | null;
}

export interface BlockTitle {
  text: string;
  hasOutput: boolean;
  hasException: boolean;
}

export interface BlockView {
  title: BlockTitle;
  lines: Line[];
}

interface SourceLine {
  number: number;
  from: number;
  to: number;
}

interface LocatedState {
  loc: Loc;
  state: StatementState;
}

interface BlockContext {
  node: TraceNode;
  loc: Loc;
}

function requireBlock(trace: Trace, block: NodeId): BlockContext {
  const node = trace.nodes[block];
  const loc = node === undefined ? undefined : trace.header.locs[node.loc];

  if (node === undefined || loc === undefined || loc.role !== "block") {
    throw new Error(`Node ${block} is not a block`);
  }

  return { node, loc };
}

function containingBlock(trace: Trace, nodeId: NodeId | null): NodeId | null {
  let current = nodeId;

  while (current !== null) {
    const node = trace.nodes[current];

    if (node === undefined) return null;

    if (trace.header.locs[node.loc]?.role === "block") return current;

    current = node.parent;
  }

  return null;
}

function blockSite(trace: Trace, block: NodeId): Site | null {
  const parent = trace.nodes[block]?.parent ?? null;
  const parentNode = parent === null ? undefined : trace.nodes[parent];
  const owner = containingBlock(trace, parentNode?.parent ?? null);

  if (parentNode === undefined || owner === null) return null;

  return (
    blockSites(trace, owner).find((site) => site.loc === parentNode.loc) ?? null
  );
}

export interface SiblingPosition {
  index: number;
  count: number;
}

function siblingPosition(trace: Trace, block: NodeId): SiblingPosition | null {
  const site = blockSite(trace, block);

  return site === null
    ? null
    : { index: site.blocks.indexOf(block), count: site.blocks.length };
}

function blockTitle(
  trace: Trace,
  block: NodeId,
  node: TraceNode,
  loc: Loc,
  knownPosition: SiblingPosition | null,
) {
  const source = trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  let text: string;

  if (loc.kind === "module") {
    text = source.file;
  } else {
    const position = knownPosition ?? siblingPosition(trace, block);
    const index = position?.index ?? 0;

    if (loc.kind === "iteration") {
      text = `iteration ${index}`;
    } else {
      const name = loc.name ?? loc.kind;
      text =
        position !== null && position.count > 1 ? `${name} · ${index}` : name;
    }
  }

  return {
    text,
    hasOutput: hasOutput(trace, block),
    hasException: node.exc !== null,
  };
}

export function buildBlockTitle(
  trace: Trace,
  block: NodeId,
  position: SiblingPosition | null = null,
): BlockTitle {
  const { node, loc } = requireBlock(trace, block);

  return blockTitle(trace, block, node, loc, position);
}

export function siblingListTitle(trace: Trace, blocks: NodeId[]): string {
  const first = blocks[0];
  const kind = first === undefined ? null : requireBlock(trace, first).loc.kind;

  return `${blocks.length} ${kind === "iteration" ? "iterations" : "calls"}`;
}

function countLineBreaks(text: string, end: number): number {
  let count = 0;

  for (let index = 0; index < end; index += 1) {
    if (text[index] === "\n") count += 1;
  }

  return count;
}

function sourceLineNumber(source: string, position: number): number {
  return countLineBreaks(source, position) + 1;
}

function sourceLines(source: string, start: number, end: number): SourceLine[] {
  const displayStart =
    start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;

  const endBreak = source.indexOf("\n", end);
  const displayEnd = endBreak === -1 ? source.length : endBreak;
  const firstNumber = sourceLineNumber(source, displayStart);
  const lines: SourceLine[] = [];
  let lineStart = displayStart;
  let number = firstNumber;

  while (lineStart <= displayEnd) {
    const nextBreak = source.indexOf("\n", lineStart);

    const lineEnd =
      nextBreak === -1 || nextBreak > displayEnd ? displayEnd : nextBreak;

    lines.push({ number, from: lineStart, to: lineEnd });

    if (lineEnd === displayEnd) break;

    lineStart = lineEnd + 1;
    number += 1;
  }

  return lines;
}

function covers(loc: Pick<Loc, "start" | "end">, position: number): boolean {
  return loc.start <= position && position < loc.end;
}

function rangeOverlaps(
  range: Pick<Loc, "start" | "end"> | Token,
  from: number,
  to: number,
): boolean {
  const start = "start" in range ? range.start : range.from;
  const end = "end" in range ? range.end : range.to;

  return start < to && end > from;
}

function addRangeBoundaries(
  boundaries: Set<number>,
  start: number,
  end: number,
  line: SourceLine,
): void {
  if (start > line.from && start < line.to) boundaries.add(start);

  if (end > line.from && end < line.to) boundaries.add(end);
}

function stateAt(
  position: number,
  states: LocatedState[],
  nestedBlocks: Loc[],
): StatementState {
  const covering = states.filter(({ loc }) => covers(loc, position));

  const statement =
    covering.find(({ state }) => state !== "inert") ?? covering[0];

  if (statement !== undefined) return statement.state;

  if (nestedBlocks.some((loc) => covers(loc, position))) return "inert";

  return "lit";
}

function siteLocs(trace: Trace, sites: Site[]): { id: LocId; loc: Loc }[] {
  const locs: { id: LocId; loc: Loc }[] = [];

  for (const site of sites) {
    if (site.blocks.length === 0) continue;
    const loc = trace.header.locs[site.loc];

    if (loc !== undefined) locs.push({ id: site.loc, loc });
  }

  return locs.sort((left, right) => {
    const leftLength = left.loc.end - left.loc.start;
    const rightLength = right.loc.end - right.loc.start;

    return rightLength - leftLength || left.loc.start - right.loc.start;
  });
}

function spansForLine(
  source: string,
  line: SourceLine,
  tokens: Token[],
  states: LocatedState[],
  nestedBlocks: Loc[],
  sites: { id: LocId; loc: Loc }[],
): Span[] {
  if (line.from === line.to) return [];

  const boundaries = new Set([line.from, line.to]);

  for (const token of tokens) {
    if (rangeOverlaps(token, line.from, line.to)) {
      addRangeBoundaries(boundaries, token.from, token.to, line);
    }
  }

  for (const { loc } of states) {
    if (rangeOverlaps(loc, line.from, line.to)) {
      addRangeBoundaries(boundaries, loc.start, loc.end, line);
    }
  }

  for (const loc of nestedBlocks) {
    if (rangeOverlaps(loc, line.from, line.to)) {
      addRangeBoundaries(boundaries, loc.start, loc.end, line);
    }
  }

  for (const { loc } of sites) {
    if (rangeOverlaps(loc, line.from, line.to)) {
      addRangeBoundaries(boundaries, loc.start, loc.end, line);
    }
  }

  const points = [...boundaries].sort((left, right) => left - right);
  const spans: Span[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    if (from === undefined || to === undefined || from === to) continue;

    const token = tokens.find(
      (candidate) => candidate.from <= from && candidate.to >= to,
    );

    const coveredSites: LocId[] = [];

    for (const site of sites) {
      if (covers(site.loc, from)) coveredSites.push(site.id);
    }

    spans.push({
      text: source.slice(from, to),
      classes: token?.classes ?? "",
      state: stateAt(from, states, nestedBlocks),
      sites: coveredSites,
    });
  }

  return spans;
}

function lineContaining(
  source: string,
  lines: SourceLine[],
  position: number,
): number | null {
  const number = sourceLineNumber(source, position);
  const line = lines.find((candidate) => candidate.number === number);

  return line?.number ?? null;
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

  return {
    title: blockTitle(trace, block, node, loc, null),
    lines: lines.map((line) => ({
      number: line.number,
      spans: spansForLine(
        source.text,
        line,
        tokens,
        states,
        nestedBlocks,
        clickableSites,
      ),
      output: outputs.get(line.number) ?? null,
      exception: exceptions.get(line.number) ?? null,
    })),
  };
}
