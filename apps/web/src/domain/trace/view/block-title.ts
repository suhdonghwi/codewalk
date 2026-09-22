import { blockSites, blockValues } from "@codewalk/trace";

import type { Loc, NodeId, Site, Trace, TraceNode } from "@codewalk/trace";

import { previewInlineText } from "./inline-output.ts";

export interface BlockTitle {
  text: string;
  hasException: boolean;
}

interface BlockContext {
  node: TraceNode;
  loc: Extract<Loc, { role: "block" }>;
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

  const position = knownPosition ?? siblingPosition(trace, block);

  const indexedTitle =
    position !== null && position.count > 1
      ? `${loc.title} ${position.index + 1}`
      : loc.title;

  const entries = blockValues(trace, block).flatMap((value) => {
    const anchor = trace.header.locs[value.loc];

    if (anchor === undefined) return [];
    const preview = previewInlineText(value.text);
    const name = source.text.slice(anchor.start, anchor.end);
    const text = preview.segments.map((segment) => segment.text).join("");

    return [`${name} = ${text}`];
  });

  const text =
    entries.length === 0
      ? indexedTitle
      : `${indexedTitle} (${entries.join(", ")})`;

  return {
    text,
    hasException: node.exc !== null,
  };
}

export function siblingListTitle(trace: Trace, blocks: NodeId[]): string {
  const first = blocks[0];

  if (first === undefined) throw new Error("A sibling list needs a block");

  return `${blocks.length} ${requireBlock(trace, first).loc.unit}s`;
}
