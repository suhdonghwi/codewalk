import type { Trace, TraceParseError } from "@codewalk/trace";

export interface RunRequest {
  source: string;
  stdin: string;
}

export type RunOutcome =
  | { kind: "trace"; trace: Trace }
  | { kind: "invalid"; error: TraceParseError }
  | { kind: "failed"; status: number }
  | { kind: "unreachable" };
