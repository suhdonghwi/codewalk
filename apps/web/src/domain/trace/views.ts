import { match, P } from "ts-pattern";

import type { LocId, NodeId, Role, Trace } from "@codewalk/trace";

export interface Site {
  loc: LocId;
  blocks: NodeId[];
  outputs: number[];
}

export type StatementState = "lit" | "dimmed" | "inert";

function nodeRole(trace: Trace, node: NodeId): Role | undefined {
  const traceNode = trace.nodes[node];

  return traceNode === undefined
    ? undefined
    : trace.header.locs[traceNode.loc]?.role;
}

export function blockPath(trace: Trace, node: NodeId): NodeId[] {
  const path: NodeId[] = [];
  let current: NodeId | null = node;

  while (current !== null) {
    if (nodeRole(trace, current) === "block") path.push(current);
    current = trace.nodes[current]?.parent ?? null;
  }

  return path.reverse();
}

export function blockSites(trace: Trace, block: NodeId): Site[] {
  const sites: Site[] = [];
  const sitesByLoc = new Map<LocId, Site>();

  const visit = (nodeId: NodeId): void => {
    const node = trace.nodes[nodeId];

    if (node === undefined) return;
    const role = trace.header.locs[node.loc]?.role;

    if (role === undefined) return;

    match(role)
      .with("block", () => undefined)
      .with(P.union("stmt", "expr"), () => {
        const blocks: NodeId[] = [];

        for (const child of node.children) {
          if (nodeRole(trace, child) === "block") blocks.push(child);
        }

        if (blocks.length > 0 || node.outputs.length > 0) {
          let site = sitesByLoc.get(node.loc);

          if (site === undefined) {
            site = { loc: node.loc, blocks: [], outputs: [] };
            sitesByLoc.set(node.loc, site);
            sites.push(site);
          }

          // Not `push(...blocks)`: a loop statement can hold more iterations
          // than the engine accepts as call arguments.
          for (const childBlock of blocks) site.blocks.push(childBlock);

          for (const output of node.outputs) site.outputs.push(output);
        }

        for (const child of node.children) {
          if (nodeRole(trace, child) !== "block") visit(child);
        }
      })
      .exhaustive();
  };

  const blockNode = trace.nodes[block];

  if (blockNode === undefined) return [];

  for (const child of blockNode.children) visit(child);

  return sites;
}

function nearestBlockLoc(trace: Trace, locId: LocId): LocId | null {
  let current = trace.header.locs[locId]?.parent ?? null;

  while (current !== null) {
    const loc = trace.header.locs[current];

    if (loc === undefined) return null;

    if (loc.role === "block") return current;
    current = loc.parent;
  }

  return null;
}

export function statementStates(
  trace: Trace,
  block: NodeId,
): { loc: LocId; state: StatementState }[] {
  const blockNode = trace.nodes[block];

  if (blockNode === undefined) return [];
  const blockLoc = trace.header.locs[blockNode.loc];

  if (blockLoc === undefined) return [];

  const executed = new Set<LocId>();

  for (const child of blockNode.children) {
    if (nodeRole(trace, child) === "stmt") {
      const childNode = trace.nodes[child];

      if (childNode !== undefined) executed.add(childNode.loc);
    }
  }

  const states: { loc: LocId; state: StatementState }[] = [];

  for (let locId = 0; locId < trace.header.locs.length; locId += 1) {
    const loc = trace.header.locs[locId];

    if (loc === undefined) continue;
    match(loc.role)
      .with("stmt", () => {
        if (
          loc.file !== blockLoc.file ||
          loc.start < blockLoc.start ||
          loc.end > blockLoc.end
        ) {
          return;
        }

        const owner = nearestBlockLoc(trace, locId);

        const state: StatementState =
          owner === blockNode.loc
            ? executed.has(locId)
              ? "lit"
              : "dimmed"
            : "inert";

        states.push({ loc: locId, state });
      })
      .with(P.union("block", "expr"), () => undefined)
      .exhaustive();
  }

  return states;
}

function lastStatementChild(trace: Trace, block: NodeId): NodeId | null {
  const children = trace.nodes[block]?.children ?? [];

  for (let index = children.length - 1; index >= 0; index -= 1) {
    const child = children[index];

    if (child !== undefined && nodeRole(trace, child) === "stmt") return child;
  }

  return null;
}

function lastFrontierBlock(trace: Trace, statement: NodeId): NodeId | null {
  let last: NodeId | null = null;

  const visit = (nodeId: NodeId): void => {
    const node = trace.nodes[nodeId];

    if (node === undefined) return;

    for (const child of node.children) {
      const role = nodeRole(trace, child);

      if (role === undefined) continue;
      match(role)
        .with("block", () => {
          last = child;
        })
        .with(P.union("stmt", "expr"), () => visit(child))
        .exhaustive();
    }
  };

  visit(statement);

  return last;
}

export function exceptionOrigin(
  trace: Trace,
): { block: NodeId; stmt: NodeId | null } | null {
  if (trace.root === null || trace.nodes[trace.root]?.exc === null) return null;

  let block = trace.root;

  while (true) {
    const stmt = lastStatementChild(trace, block);

    if (stmt === null) return { block, stmt: null };
    const childBlock = lastFrontierBlock(trace, stmt);

    if (childBlock !== null && trace.nodes[childBlock]?.exc !== null) {
      block = childBlock;
      continue;
    }

    return { block, stmt };
  }
}
