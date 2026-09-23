import { blockLoc } from "../views.ts";

import {
  pieceText,
  PREVIEW_BUDGET,
  previewPieces,
  valueKey,
} from "./values.ts";

import type { Piece } from "./values.ts";

import type { Trace, TraceNode, ValueChunk } from "@codewalk/trace";

export type SiblingCell = Piece[] | null;

export interface SiblingColumn {
  name: string;
  width: number;
  carried: boolean;
}

const DOUBLE_WIDTH = /[…ᄀ-ᅟ⺀-꓏가-힣豈-﫿︰-﹏＀-｠￠-￦\u{1F300}-\u{1FAFF}]/u;

function textWidth(text: string): number {
  let width = 0;

  for (const character of text) width += DOUBLE_WIDTH.test(character) ? 2 : 1;

  return width;
}

type Shown = Map<string, ValueChunk>;

function entryValues(block: TraceNode): Shown {
  return new Map(block.values.map((chunk) => [chunk.name, chunk]));
}

function exitValues(block: TraceNode): Shown {
  const values = entryValues(block);

  for (const statement of block.children) {
    for (const chunk of statement.values) values.set(chunk.name, chunk);
  }

  return values;
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

function isCarried(blocks: TraceNode[], name: string): boolean {
  return blocks.some((block) =>
    block.values.some((value) => value.name === name && value.loc === null),
  );
}

export function siblingColumns(
  trace: Trace,
  blocks: TraceNode[],
): SiblingColumn[] {
  const valuesByBlock = blocks.map(entryValues);
  const names = new Set(valuesByBlock.flatMap((values) => [...values.keys()]));
  const [first] = valuesByBlock;
  const last = blocks.at(-1);
  const exit: Shown = last === undefined ? new Map() : exitValues(last);
  const rebinds = last === undefined ? [] : (blockLoc(last).rebinds ?? []);

  return [...names].flatMap((name) => {
    const carried = isCarried(blocks, name);
    const firstKey = keyOf(trace, first?.get(name));

    const varies =
      valuesByBlock.some(
        (values) => keyOf(trace, values.get(name)) !== firstKey,
      ) ||
      (carried && keyOf(trace, exit.get(name)) !== firstKey);

    if (blocks.length > 1 && !varies && !rebinds.includes(name)) return [];

    const shown = (chunk: ValueChunk | undefined) =>
      textWidth(pieceText(cellPieces(trace, chunk) ?? []));

    let width = Math.max(textWidth(name), carried ? shown(exit.get(name)) : 0);

    for (const values of valuesByBlock) {
      width = Math.max(width, shown(values.get(name)));
    }

    return [{ name, width, carried }];
  });
}

export function siblingCells(
  trace: Trace,
  block: TraceNode,
  columns: SiblingColumn[],
): SiblingCell[] {
  const values = entryValues(block);

  return columns.map(({ name }) => cellPieces(trace, values.get(name)));
}

export function siblingAfter(
  trace: Trace,
  blocks: TraceNode[],
  columns: SiblingColumn[],
): SiblingCell[] | null {
  const last = blocks.at(-1);

  if (last === undefined) return null;
  const entry = entryValues(last);
  const exit = exitValues(last);

  const changed = columns.some(({ name, carried }) => {
    const key = carried ? keyOf(trace, exit.get(name)) : null;

    return key !== null && key !== keyOf(trace, entry.get(name));
  });

  if (!changed) return null;

  return columns.map(({ name, carried }) =>
    cellPieces(trace, carried ? exit.get(name) : undefined),
  );
}

export function siblingListTitle(blocks: TraceNode[]): string {
  const [first] = blocks;

  if (first === undefined) throw new Error("A sibling list needs a block");

  return `${blocks.length} ${blockLoc(first).unit}s`;
}
