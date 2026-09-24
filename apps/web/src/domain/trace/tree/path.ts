import { requireNode } from "../views.ts";

import type { LocId, NodeId, Trace, TraceNode } from "@codewalk/trace";

export type Path = NodeId[];

export interface PathColumn {
  block: TraceNode;
  blocks: TraceNode[];
  expandedIndex: number;
  openSite: LocId | null;
}

export function initialPath(trace: Trace): Path {
  const root = trace.nodes[0];

  return root === undefined ? [] : [root.id];
}

export function pathColumns(trace: Trace, path: Path): PathColumn[] {
  const nodes = path.map((id) => requireNode(trace, id));
  let blocks = nodes.slice(0, 1);

  return nodes.map((block, column) => {
    const next = nodes[column + 1];

    const site =
      next === undefined
        ? undefined
        : block.sites.find((candidate) => candidate.blocks.includes(next));

    const current = {
      block,
      blocks,
      expandedIndex: blocks.indexOf(block),
      openSite: site?.loc.id ?? null,
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

  const selected = requireNode(trace, block).sites.find(
    (candidate) => candidate.loc.id === site,
  );

  const next = path[column + 1];

  if (next !== undefined && selected?.blocks.some(({ id }) => id === next)) {
    return path.slice(0, column + 1);
  }

  const firstBlock = selected?.blocks[0];

  return firstBlock === undefined
    ? path
    : [...path.slice(0, column + 1), firstBlock.id];
}

export function selectSibling(path: Path, column: number, block: NodeId): Path {
  if (path[column] === block) return path;

  return [...path.slice(0, column), block];
}
