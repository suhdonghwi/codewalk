import { requireBlock } from "../views.ts";

import type { NodeId, Trace } from "@codewalk/trace";

export interface BlockTitle {
  text: string;
  hasException: boolean;
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
  const { node, loc, source } = requireBlock(trace, block);

  const indexedTitle =
    position.count > 1 ? `${loc.title} ${position.index + 1}` : loc.title;

  const entries = node.values.flatMap((value) => {
    const anchor = trace.header.locs[value.loc];

    if (anchor === undefined) return [];
    const name = source.slice(anchor.start, anchor.end);

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
