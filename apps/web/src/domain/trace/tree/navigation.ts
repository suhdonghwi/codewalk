import { exceptionOrigin, pathTo } from "@codewalk/trace";

import { sourceLineNumber } from "../view/block-view.ts";

import type { Path } from "./path.ts";
import type { NodeId, Trace } from "@codewalk/trace";

export interface Focus {
  kind: "output" | "exception";
  block: NodeId;
  line: number;
  chunk: number | null;
}

interface NodeNavigation {
  path: Path;
  block: NodeId;
  line: number;
}

export interface FocusNavigation {
  path: Path;
  focus: Focus;
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

export function navigateToOutput(trace: Trace, chunk: number): FocusNavigation {
  const output = trace.outputs[chunk];

  if (output === undefined) throw new Error(`Output chunk ${chunk} is missing`);
  const navigation = navigateToNode(trace, output.node);

  return {
    path: navigation.path,
    focus: {
      kind: "output",
      block: navigation.block,
      line: navigation.line,
      chunk,
    },
  };
}

export function navigateToException(trace: Trace): FocusNavigation | null {
  if (trace.end.status !== "exception") return null;
  const origin = exceptionOrigin(trace);

  if (origin === null) return null;

  if (origin.stmt !== null) {
    const navigation = navigateToNode(trace, origin.stmt);

    return {
      path: navigation.path,
      focus: {
        kind: "exception",
        block: navigation.block,
        line: navigation.line,
        chunk: null,
      },
    };
  }

  const path = pathTo(trace, origin.block).map((step) => step.block);
  const { loc, source } = nodeLocation(trace, origin.block);

  return {
    path,
    focus: {
      kind: "exception",
      block: origin.block,
      line: sourceLineNumber(source.text, loc.start),
      chunk: null,
    },
  };
}
