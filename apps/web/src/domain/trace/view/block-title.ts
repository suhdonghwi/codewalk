import { requireBlock } from "../views.ts";

import type { NodeId, Trace } from "@codewalk/trace";

export interface BlockTitle {
  label: string;
  text: string;
  hasException: boolean;
}

export interface SiblingCell {
  text: string | null;
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

const MAX_COLUMN_WIDTH = 24;

function blockValues(trace: Trace, block: NodeId): Map<string, string> {
  return new Map(
    requireBlock(trace, block).node.values.map(({ name, text }) => [
      name,
      text,
    ]),
  );
}

function blockExitValues(trace: Trace, block: NodeId): Map<string, string> {
  const values = blockValues(trace, block);

  for (const child of requireBlock(trace, block).node.children) {
    const statement = trace.nodes[child];

    if (
      statement === undefined ||
      trace.header.locs[statement.loc]?.role !== "stmt"
    ) {
      continue;
    }

    for (const { name, text } of statement.values) values.set(name, text);
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

  const exit =
    last === undefined
      ? new Map<string, string>()
      : blockExitValues(trace, last);

  return names.flatMap((name) => {
    const carried = isCarried(trace, blocks, name);

    const varies =
      valuesByBlock.some((values) => values.get(name) !== first?.get(name)) ||
      (carried && exit.get(name) !== first?.get(name));

    if (blocks.length > 1 && !varies) return [];

    let width = Math.max(
      name.length,
      carried ? (exit.get(name)?.length ?? 0) : 0,
    );

    for (const values of valuesByBlock) {
      width = Math.max(width, values.get(name)?.length ?? 0);
    }

    return [{ name, width: Math.min(width, MAX_COLUMN_WIDTH), carried }];
  });
}

export function buildBlockTitle(
  trace: Trace,
  block: NodeId,
  position: SiblingPosition,
  columns: SiblingColumn[],
): BlockTitle {
  const { node, loc } = requireBlock(trace, block);
  const values = blockValues(trace, block);

  const label =
    position.count > 1 ? `${loc.title} ${position.index + 1}` : loc.title;

  const entries = columns.flatMap(({ name }) => {
    const text = values.get(name);

    return text === undefined ? [] : [`${name} = ${text}`];
  });

  return {
    label,
    text: entries.length === 0 ? label : `${label} (${entries.join(", ")})`,
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

  const values =
    block === undefined ? new Map<string, string>() : blockValues(trace, block);

  const previous =
    previousBlock === undefined ? null : blockValues(trace, previousBlock);

  return columns.map(({ name }) => {
    const text = values.get(name) ?? null;

    return {
      text,
      repeated: text !== null && previous?.get(name) === text,
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
    const text = carried ? (exit.get(name) ?? null) : null;

    return { text, repeated: text !== null && entry.get(name) === text };
  });

  return cells.some(({ text, repeated }) => text !== null && !repeated)
    ? cells
    : null;
}

export function siblingListTitle(trace: Trace, blocks: NodeId[]): string {
  const first = blocks[0];

  if (first === undefined) throw new Error("A sibling list needs a block");

  return `${blocks.length} ${requireBlock(trace, first).loc.unit}s`;
}
