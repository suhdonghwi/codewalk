import { blockPath, exceptionOrigin } from "../views.ts";

import type { Path } from "./path.ts";
import type { Trace } from "@codewalk/trace";

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
