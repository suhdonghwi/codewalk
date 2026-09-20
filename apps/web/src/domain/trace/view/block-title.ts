import { blockSites } from "@codewalk/trace";

import type { Loc, NodeId, Site, Trace, TraceNode } from "@codewalk/trace";

export interface BlockTitle {
  text: string;
  hasException: boolean;
}

interface BlockContext {
  node: TraceNode;
  loc: Loc;
}

export function requireBlock(trace: Trace, block: NodeId): BlockContext {
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

export function buildBlockTitle(
  trace: Trace,
  block: NodeId,
  knownPosition: SiblingPosition | null = null,
): BlockTitle {
  const { node, loc } = requireBlock(trace, block);
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
    hasException: node.exc !== null,
  };
}

export function siblingListTitle(trace: Trace, blocks: NodeId[]): string {
  const first = blocks[0];
  const kind = first === undefined ? null : requireBlock(trace, first).loc.kind;

  return `${blocks.length} ${kind === "iteration" ? "iterations" : "calls"}`;
}
