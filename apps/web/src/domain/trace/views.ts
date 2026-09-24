import type { NodeId, Trace, TraceLoc, TraceNode } from "@codewalk/trace";

export type StatementState = "lit" | "dimmed" | "inert";

export interface LocatedState {
  loc: TraceLoc;
  state: StatementState;
}

export interface RaisedException {
  stmt: TraceNode;
  exc: string;
}

export function requireNode(trace: Trace, id: NodeId): TraceNode {
  const node = trace.nodes[id];

  if (node === undefined) throw new Error(`Node ${id} is missing`);

  return node;
}

export function blockLoc(
  block: TraceNode,
): Extract<TraceLoc, { role: "block" }> {
  if (block.loc.role !== "block") {
    throw new Error(`Node ${block.id} is not a block`);
  }

  return block.loc;
}

export function blockTitle(
  block: TraceNode,
  index: number,
  count: number,
): string {
  const { title } = blockLoc(block);

  return count > 1 ? `${title} ${index + 1}` : title;
}

export function blockPath(node: TraceNode): NodeId[] {
  const path: NodeId[] = [];

  for (
    let current: TraceNode | null = node;
    current !== null;
    current = current.parent
  ) {
    if (current.loc.role === "block") path.push(current.id);
  }

  return path.reverse();
}

export function statementStates(
  trace: Trace,
  block: TraceNode,
): LocatedState[] {
  const executed = new Set(block.children.map((child) => child.loc.id));

  return trace.locs.flatMap((loc) => {
    if (
      loc.role !== "stmt" ||
      loc.start < block.loc.start ||
      loc.end > block.loc.end
    ) {
      return [];
    }

    const state: StatementState =
      loc.owner !== block.loc.id
        ? "inert"
        : executed.has(loc.id)
          ? "lit"
          : "dimmed";

    return [{ loc, state }];
  });
}

function lastInnerBlock(node: TraceNode): TraceNode | null {
  let last: TraceNode | null = null;

  for (const child of node.children) {
    last = child.loc.role === "block" ? child : (lastInnerBlock(child) ?? last);
  }

  return last;
}

function raisingBlock(statement: TraceNode): TraceNode | null {
  const inner = lastInnerBlock(statement);

  return inner !== null && inner.exc !== null ? inner : null;
}

export function exceptionOrigin(trace: Trace): TraceNode | null {
  let block = trace.nodes[0];

  if (block === undefined || block.exc === null) return null;

  while (true) {
    const statement = block.children.at(-1);

    if (statement === undefined) return block;

    const inner = raisingBlock(statement);

    if (inner === null) return statement;
    block = inner;
  }
}

export function raisedExceptions(block: TraceNode): RaisedException[] {
  const raised = block.children.flatMap((stmt) =>
    stmt.exc === null ? [] : [{ stmt, exc: stmt.exc }],
  );

  const last = block.children.at(-1);

  if (block.exc === null || last === undefined || raisingBlock(last) !== null) {
    return raised;
  }

  return [...raised, { stmt: last, exc: block.exc }];
}
