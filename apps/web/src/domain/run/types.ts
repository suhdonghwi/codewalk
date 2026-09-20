import type { Trace, TraceParseError } from "@codewalk/trace";

export interface RunRequest {
  source: string;
  stdin: string;
}

export type RunOutcome =
  | { kind: "trace"; trace: Trace }
  | { kind: "invalid"; error: TraceParseError }
  | { kind: "unreachable"; message: string };

export interface TraceRunner {
  run(request: RunRequest): Promise<RunOutcome>;
}
