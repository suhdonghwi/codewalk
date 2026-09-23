import { blockSites } from "../views.ts";

import type { Site } from "../views.ts";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

export type Path = NodeId[];

export interface PathColumn {
  blocks: NodeId[];
  expandedIndex: number;
  openSite: LocId | null;
}

export function initialPath(trace: Trace): Path {
  return trace.root === null ? [] : [trace.root];
}

function siteContaining(
  trace: Trace,
  block: NodeId,
  child: NodeId,
): Site | null {
  return (
    blockSites(trace, block).find((site) => site.blocks.includes(child)) ?? null
  );
}

export function pathColumn(
  trace: Trace,
  path: Path,
  column: number,
): PathColumn | null {
  const block = path[column];

  if (block === undefined) return null;

  const next = path[column + 1];

  const openSite =
    next === undefined
      ? null
      : (siteContaining(trace, block, next)?.loc ?? null);

  if (column === 0) {
    return { blocks: [block], expandedIndex: 0, openSite };
  }

  const parent = path[column - 1];

  if (parent === undefined) return null;
  const parentSite = siteContaining(trace, parent, block);

  if (parentSite === null) return null;
  const expandedIndex = parentSite.blocks.indexOf(block);

  if (expandedIndex === -1) return null;

  return { blocks: parentSite.blocks, expandedIndex, openSite };
}

export function toggleSite(
  trace: Trace,
  path: Path,
  column: number,
  site: LocId,
): Path {
  const block = path[column];

  if (block === undefined) return path;
  const current = pathColumn(trace, path, column);

  if (current?.openSite === site) return path.slice(0, column + 1);

  const selectedSite = blockSites(trace, block).find(
    (candidate) => candidate.loc === site,
  );

  const firstBlock = selectedSite?.blocks[0];

  return firstBlock === undefined
    ? path
    : [...path.slice(0, column + 1), firstBlock];
}

export function selectSibling(path: Path, column: number, block: NodeId): Path {
  if (path[column] === block) return path;

  return [...path.slice(0, column), block];
}
