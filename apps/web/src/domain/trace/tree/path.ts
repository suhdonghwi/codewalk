import { blockSites } from "../views.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

export type Path = NodeId[];

export interface PathColumn {
  block: NodeId;
  blocks: NodeId[];
  expandedIndex: number;
  openSite: LocId | null;
}

export function initialPath(trace: Trace): Path {
  return trace.root === null ? [] : [trace.root];
}

export function pathColumns(trace: Trace, path: Path): PathColumn[] {
  let blocks = path.slice(0, 1);

  return path.map((block, column) => {
    const next = path[column + 1];

    const site =
      next === undefined
        ? undefined
        : blockSites(trace, block).find((candidate) =>
            candidate.blocks.includes(next),
          );

    const current = {
      block,
      blocks,
      expandedIndex: blocks.indexOf(block),
      openSite: site?.loc ?? null,
    };

    blocks = site?.blocks ?? [];

    return current;
  });
}

export function toggleSite(
  trace: Trace,
  path: Path,
  column: number,
  site: LocId,
): Path {
  const block = path[column];

  if (block === undefined) return path;

  const selected = blockSites(trace, block).find(
    (candidate) => candidate.loc === site,
  );

  const next = path[column + 1];

  if (next !== undefined && selected?.blocks.includes(next)) {
    return path.slice(0, column + 1);
  }

  const firstBlock = selected?.blocks[0];

  return firstBlock === undefined
    ? path
    : [...path.slice(0, column + 1), firstBlock];
}

export function selectSibling(path: Path, column: number, block: NodeId): Path {
  if (path[column] === block) return path;

  return [...path.slice(0, column), block];
}
