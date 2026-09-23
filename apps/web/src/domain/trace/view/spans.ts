import type { SourceLine } from "./source-lines.ts";
import type { Token } from "./tokens.ts";
import type { Loc, LocId, Site, StatementState, Trace } from "@codewalk/trace";

export interface Span {
  text: string;
  classes: string;
  state: StatementState;
  sites: LocId[];
  value: string | null;
}

export interface LocatedState {
  loc: Loc;
  state: StatementState;
}

export interface ValueAnchor {
  end: number;
  text: string;
}

interface SiteLoc {
  id: LocId;
  loc: Loc;
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

export function siteLocs(trace: Trace, sites: Site[]): SiteLoc[] {
  const locs: SiteLoc[] = [];

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

export function spansForLine(
  source: string,
  line: SourceLine,
  tokens: Token[],
  states: LocatedState[],
  nestedBlocks: Loc[],
  sites: SiteLoc[],
  values: ValueAnchor[],
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

  for (const { end } of values) {
    if (end > line.from && end < line.to) boundaries.add(end);
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
      value: values.find((value) => value.end === to)?.text ?? null,
    });
  }

  return spans;
}
