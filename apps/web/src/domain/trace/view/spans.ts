import type { SourceLine } from "./source-lines.ts";
import type { Token } from "./tokens.ts";
import type { LocatedState, StatementState } from "../views.ts";
import type { LocId, Site, TraceLoc, ValueChunk } from "@codewalk/trace";

export interface Span {
  text: string;
  classes: string;
  state: StatementState;
  sites: LocId[];
  value: ValueChunk | null;
}

interface ValueAnchor {
  end: number;
  value: ValueChunk;
}

function covers(loc: TraceLoc, position: number): boolean {
  return loc.start <= position && position < loc.end;
}

function stateAt(
  position: number,
  states: LocatedState[],
  nestedBlocks: TraceLoc[],
): StatementState {
  const covering = states.filter(({ loc }) => covers(loc, position));

  const statement =
    covering.find(({ state }) => state !== "inert") ?? covering[0];

  if (statement !== undefined) return statement.state;

  if (nestedBlocks.some((loc) => covers(loc, position))) return "inert";

  return "lit";
}

export function siteLocs(sites: Site[]): TraceLoc[] {
  return sites
    .flatMap(({ loc, blocks }) => (blocks.length === 0 ? [] : [loc]))
    .sort(
      (left, right) =>
        right.end - right.start - (left.end - left.start) ||
        left.start - right.start,
    );
}

export interface SpanContext {
  source: string;
  tokens: Token[];
  states: LocatedState[];
  nestedBlocks: TraceLoc[];
  sites: TraceLoc[];
  values: ValueAnchor[];
}

export function spansForLine(context: SpanContext, line: SourceLine): Span[] {
  if (line.from === line.to) return [];

  const { source, tokens, states, nestedBlocks, sites, values } = context;
  const ranges = [...states.map(({ loc }) => loc), ...sites];

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
      if (covers(site, from)) coveredSites.push(site.id);
    }

    spans.push({
      text: source.slice(from, to),
      classes: token?.classes ?? "",
      state: stateAt(from, states, nestedBlocks),
      sites: coveredSites,
      value: values.find((anchor) => anchor.end === to)?.value ?? null,
    });
    from = to;
  }

  return spans;
}
