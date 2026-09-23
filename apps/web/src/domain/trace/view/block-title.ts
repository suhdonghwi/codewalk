import { requireBlock } from "../views.ts";

import {
  pieceText,
  PREVIEW_BUDGET,
  previewPieces,
  valueKey,
} from "./values.ts";

import type { Piece } from "./values.ts";

import type { NodeId, Trace, ValueChunk } from "@codewalk/trace";

export interface BlockTitle {
  text: string;
  hasException: boolean;
}

export interface SiblingCell {
  pieces: Piece[] | null;
  repeated: boolean;
}

export interface SiblingPosition {
  index: number;
  count: number;
}

export interface SiblingColumn {
  name: string;
  width: number;
  carried: boolean;
}

const DOUBLE_WIDTH =
  /[\u2026\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6\u{1F300}-\u{1FAFF}]/u;

function textWidth(text: string): number {
  let width = 0;

  for (const character of text) width += DOUBLE_WIDTH.test(character) ? 2 : 1;

  return width;
}

type Shown = Map<string, ValueChunk>;

function blockValues(trace: Trace, block: NodeId): Shown {
  return new Map(
    requireBlock(trace, block).node.values.map((chunk) => [chunk.name, chunk]),
  );
}

function keyOf(trace: Trace, chunk: ValueChunk | undefined): string | null {
  return chunk === undefined ? null : valueKey(trace, chunk.value, chunk.at);
}

function cellPieces(
  trace: Trace,
  chunk: ValueChunk | undefined,
): Piece[] | null {
  return chunk === undefined
    ? null
    : previewPieces(trace, chunk.value, chunk.at, PREVIEW_BUDGET);
}

function blockExitValues(trace: Trace, block: NodeId): Shown {
  const values = blockValues(trace, block);

  for (const child of requireBlock(trace, block).node.children) {
    const statement = trace.nodes[child];

    if (
      statement === undefined ||
      trace.header.locs[statement.loc]?.role !== "stmt"
    ) {
      continue;
    }

    for (const chunk of statement.values) values.set(chunk.name, chunk);
  }

  return values;
}

function isCarried(trace: Trace, blocks: NodeId[], name: string): boolean {
  return blocks.some((block) =>
    requireBlock(trace, block).node.values.some(
      (value) => value.name === name && value.loc === null,
    ),
  );
}

export function siblingColumns(
  trace: Trace,
  blocks: NodeId[],
): SiblingColumn[] {
  const valuesByBlock = blocks.map((block) => blockValues(trace, block));
  const names: string[] = [];

  for (const values of valuesByBlock) {
    for (const name of values.keys()) {
      if (!names.includes(name)) names.push(name);
    }
  }

  const [first] = valuesByBlock;
  const last = blocks.at(-1);

  const exit: Shown =
    last === undefined ? new Map() : blockExitValues(trace, last);

  const firstKey = (name: string) => keyOf(trace, first?.get(name));

  return names.flatMap((name) => {
    const carried = isCarried(trace, blocks, name);

    const varies =
      valuesByBlock.some(
        (values) => keyOf(trace, values.get(name)) !== firstKey(name),
      ) ||
      (carried && keyOf(trace, exit.get(name)) !== firstKey(name));

    if (blocks.length > 1 && !varies) return [];

    const shown = (chunk: ValueChunk | undefined) =>
      textWidth(pieceText(cellPieces(trace, chunk) ?? []));

    let width = Math.max(textWidth(name), carried ? shown(exit.get(name)) : 0);

    for (const values of valuesByBlock) {
      width = Math.max(width, shown(values.get(name)));
    }

    return [{ name, width, carried }];
  });
}

export function buildBlockTitle(
  trace: Trace,
  block: NodeId,
  position: SiblingPosition,
): BlockTitle {
  const { node, loc } = requireBlock(trace, block);

  return {
    text: position.count > 1 ? `${loc.title} ${position.index + 1}` : loc.title,
    hasException: node.exc !== null,
  };
}

export function siblingCells(
  trace: Trace,
  blocks: NodeId[],
  index: number,
  columns: SiblingColumn[],
): SiblingCell[] {
  const block = blocks[index];
  const previousBlock = blocks[index - 1];

  const values: Shown =
    block === undefined ? new Map() : blockValues(trace, block);

  const previous =
    previousBlock === undefined ? null : blockValues(trace, previousBlock);

  return columns.map(({ name }) => {
    const key = keyOf(trace, values.get(name));

    return {
      pieces: cellPieces(trace, values.get(name)),
      repeated: key !== null && keyOf(trace, previous?.get(name)) === key,
    };
  });
}

export function siblingAfter(
  trace: Trace,
  blocks: NodeId[],
  columns: SiblingColumn[],
): SiblingCell[] | null {
  const last = blocks.at(-1);

  if (last === undefined) return null;
  const entry = blockValues(trace, last);
  const exit = blockExitValues(trace, last);

  const cells = columns.map(({ name, carried }) => {
    const chunk = carried ? exit.get(name) : undefined;
    const key = keyOf(trace, chunk);

    return {
      pieces: cellPieces(trace, chunk),
      repeated: key !== null && keyOf(trace, entry.get(name)) === key,
    };
  });

  return cells.some(({ pieces, repeated }) => pieces !== null && !repeated)
    ? cells
    : null;
}

export function siblingListTitle(trace: Trace, blocks: NodeId[]): string {
  const first = blocks[0];

  if (first === undefined) throw new Error("A sibling list needs a block");

  return `${blocks.length} ${requireBlock(trace, first).loc.unit}s`;
}
