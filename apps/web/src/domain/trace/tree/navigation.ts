import { exceptionOrigin, pathTo } from "@codewalk/trace";

import type { Path } from "./path.ts";
import type { NodeId, Trace } from "@codewalk/trace";

function blockPath(trace: Trace, node: NodeId): Path {
  const path = pathTo(trace, node).map((step) => step.block);

  if (path.length === 0) throw new Error(`Node ${node} has no block path`);

  return path;
}

export function outputPath(trace: Trace, chunk: number): Path {
  const output = trace.outputs[chunk];

  if (output === undefined) throw new Error(`Output chunk ${chunk} is missing`);

  return blockPath(trace, output.node);
}

export function exceptionPath(trace: Trace): Path | null {
  if (trace.end.status !== "exception") return null;
  const origin = exceptionOrigin(trace);

  return origin === null ? null : blockPath(trace, origin.stmt ?? origin.block);
}
