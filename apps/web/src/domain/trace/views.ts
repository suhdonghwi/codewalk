import { match, P } from "ts-pattern";

import type { LocId, NodeId, Role, Trace, TraceNode } from "@codewalk/trace";

function isBlockRole(role: Role | undefined): boolean {
  return role === "block";
}

export interface PathStep {
  block: NodeId;
  site: NodeId | null;
}

export interface Site {
  loc: LocId;
  nodes: NodeId[];
  blocks: NodeId[];
  outputs: number[];
}

export type StatementState = "lit" | "dimmed" | "inert";

function nodeRole(trace: Trace, node: NodeId) {
  const traceNode = trace.nodes[node];

  return traceNode === undefined
    ? undefined
    : trace.header.locs[traceNode.loc]?.role;
}

function isStatementRole(role: Role | undefined): boolean {
  return role === "stmt";
}

export function pathTo(trace: Trace, target: NodeId): PathStep[] {
  const targetNode = trace.nodes[target];

  if (targetNode === undefined) return [];

  const reverseBlocks: NodeId[] = [];
  let current: NodeId | null = target;

  while (current !== null) {
    const node: TraceNode | undefined = trace.nodes[current];

    if (node === undefined) break;

    if (isBlockRole(trace.header.locs[node.loc]?.role)) {
      reverseBlocks.push(current);
    }

    current = node.parent;
  }

  const blocks = reverseBlocks.reverse();
  const steps: PathStep[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];

    if (block === undefined) continue;
    const nextBlock = blocks[index + 1];

    if (nextBlock !== undefined) {
      steps.push({ block, site: trace.nodes[nextBlock]?.parent ?? null });
      continue;
    }

    steps.push({
      block,
      site: isBlockRole(nodeRole(trace, target)) ? null : target,
    });
  }

  return steps;
}

export function blockSites(trace: Trace, block: NodeId): Site[] {
  if (!isBlockRole(nodeRole(trace, block))) return [];

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
          if (isBlockRole(nodeRole(trace, child))) blocks.push(child);
        }

        if (blocks.length > 0 || node.outputs.length > 0) {
          let site = sitesByLoc.get(node.loc);

          if (site === undefined) {
            site = { loc: node.loc, nodes: [], blocks: [], outputs: [] };
            sitesByLoc.set(node.loc, site);
            sites.push(site);
          }

          site.nodes.push(nodeId);

          // Not `push(...blocks)`: a loop statement can hold more iterations
          // than the engine accepts as call arguments.
          for (const childBlock of blocks) site.blocks.push(childBlock);

          for (const output of node.outputs) site.outputs.push(output);
        }

        for (const child of node.children) {
          if (!isBlockRole(nodeRole(trace, child))) visit(child);
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

    if (isBlockRole(loc.role)) return current;
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

  if (blockLoc === undefined || !isBlockRole(blockLoc.role)) return [];

  const executed = new Set<LocId>();

  for (const child of blockNode.children) {
    if (isStatementRole(nodeRole(trace, child))) {
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

    if (child !== undefined && isStatementRole(nodeRole(trace, child)))
      return child;
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
