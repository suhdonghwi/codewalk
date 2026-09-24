import { blockPath, exceptionOrigin } from "../views.ts";

import { initialPath, type Path } from "./path.ts";

import type { Trace } from "@codewalk/trace";

export function outputPath(trace: Trace, chunk: number): Path {
  const output = trace.outputs[chunk];

  if (output === undefined) throw new Error(`Output chunk ${chunk} is missing`);

  return blockPath(output.node);
}

export function exceptionPath(trace: Trace): Path | null {
  if (trace.end.status !== "exception") return null;
  const origin = exceptionOrigin(trace);

  return origin === null ? null : blockPath(origin);
}

export function openingPath(trace: Trace): Path {
  return exceptionPath(trace) ?? initialPath(trace);
}
