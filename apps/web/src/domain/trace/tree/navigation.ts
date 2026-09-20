import { exceptionOrigin, pathTo } from "@codewalk/trace";

import { sourceLineNumber } from "../view/block-view.ts";

import type { Path } from "./path.ts";
import type { NodeId, Trace } from "@codewalk/trace";

export interface NodeNavigation {
  path: Path;
  block: NodeId;
  line: number;
}

function nodeLocation(trace: Trace, node: NodeId) {
  const traceNode = trace.nodes[node];

  const loc =
    traceNode === undefined ? undefined : trace.header.locs[traceNode.loc];

  const source = loc === undefined ? undefined : trace.header.sources[loc.file];

  if (loc === undefined || source === undefined) {
    throw new Error(`Node ${node} has no source location`);
  }

  return { loc, source };
}

export function navigateToNode(trace: Trace, node: NodeId): NodeNavigation {
  const path = pathTo(trace, node).map((step) => step.block);
  const block = path.at(-1);

  if (block === undefined) throw new Error(`Node ${node} has no block path`);
  const { loc, source } = nodeLocation(trace, node);

  return {
    path,
    block,
    line: sourceLineNumber(source.text, loc.end),
  };
}

export function navigateToOutput(trace: Trace, chunk: number): NodeNavigation {
  const output = trace.outputs[chunk];

  if (output === undefined) throw new Error(`Output chunk ${chunk} is missing`);

  return navigateToNode(trace, output.node);
}

export function navigateToException(trace: Trace): NodeNavigation | null {
  if (trace.end.status !== "exception") return null;
  const origin = exceptionOrigin(trace);

  if (origin === null) return null;

  if (origin.stmt !== null) return navigateToNode(trace, origin.stmt);

  const { loc, source } = nodeLocation(trace, origin.block);

  return {
    path: pathTo(trace, origin.block).map((step) => step.block),
    block: origin.block,
    line: sourceLineNumber(source.text, loc.start),
  };
}
