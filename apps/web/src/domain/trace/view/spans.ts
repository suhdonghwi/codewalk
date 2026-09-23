import type { SourceLine } from "./source-lines.ts";
import type { Token } from "./tokens.ts";
import type { Site, StatementState } from "../views.ts";
import type { Loc, LocId, Trace } from "@codewalk/trace";

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

interface ValueAnchor {
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

export interface SpanContext {
  source: string;
  tokens: Token[];
  states: LocatedState[];
  nestedBlocks: Loc[];
  sites: SiteLoc[];
  values: ValueAnchor[];
}

export function spansForLine(context: SpanContext, line: SourceLine): Span[] {
  if (line.from === line.to) return [];

  const { source, tokens, states, nestedBlocks, sites, values } = context;
  const ranges = [...states, ...sites].map(({ loc }) => loc);

  const inside = (point: number): boolean =>
    point > line.from && point < line.to;

  const points = [
    ...new Set([
      line.from,
      line.to,
      ...tokens.flatMap(({ from, to }) => [from, to]).filter(inside),
      ...[...ranges, ...nestedBlocks]
        .flatMap(({ start, end }) => [start, end])
        .filter(inside),
      ...values.map(({ end }) => end).filter(inside),
    ]),
  ].sort((left, right) => left - right);

  const spans: Span[] = [];
  let from = line.from;

  for (const to of points.slice(1)) {
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
    from = to;
  }

  return spans;
}
