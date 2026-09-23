import type { Loc, NodeId, Trace, TraceNode } from "@codewalk/trace";

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

export interface SiblingPosition {
  index: number;
  count: number;
}

export function buildBlockTitle(
  trace: Trace,
  block: NodeId,
  position: SiblingPosition,
): BlockTitle {
  const { node, loc } = requireBlock(trace, block);
  const source = trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  const indexedTitle =
    position.count > 1 ? `${loc.title} ${position.index + 1}` : loc.title;

  const entries = node.values.flatMap((value) => {
    const anchor = trace.header.locs[value.loc];

    if (anchor === undefined) return [];
    const name = source.text.slice(anchor.start, anchor.end);

    return [`${name} = ${value.text}`];
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
