import type { End } from "@codewalk/trace";
import { match } from "ts-pattern";

import type { RunOutcome } from "./types.ts";

export type OutputSegment =
  | { kind: "stdout" | "stderr"; text: string; chunk: number }
  | { kind: "notice"; text: string };

function endNotice(end: End): OutputSegment | null {
  return match<End, OutputSegment | null>(end)
    .with({ status: "ok" }, () => null)
    .with({ status: "exception" }, ({ traceback }) => ({
      kind: "notice",
      text: traceback,
    }))
    .with({ status: "timeout" }, () => ({
      kind: "notice",
      text: "Timed out",
    }))
    .with({ status: "truncated" }, () => ({
      kind: "notice",
      text: "Trace truncated",
    }))
    .with({ status: "syntax_error" }, ({ message }) => ({
      kind: "notice",
      text: message,
    }))
    .exhaustive();
}

function failureNotice(status: number): string {
  if (status === 400 || status === 413) {
    return "The program or its input is too large to run";
  }

  if (status >= 502 && status <= 504) return "Could not reach the server";

  return "The server could not run the program";
}

export function outputSegments(outcome: RunOutcome | null): OutputSegment[] {
  if (outcome === null) return [];

  if (outcome.kind === "invalid") {
    return [
      {
        kind: "notice",
        text: `Invalid trace (line ${outcome.error.line}): ${outcome.error.message}`,
      },
    ];
  }

  if (outcome.kind === "unreachable") {
    return [{ kind: "notice", text: "Could not reach the server" }];
  }

  if (outcome.kind === "failed") {
    return [{ kind: "notice", text: failureNotice(outcome.status) }];
  }

  const segments: OutputSegment[] = outcome.trace.outputs.map(
    (output, chunk) => ({ kind: output.stream, text: output.text, chunk }),
  );

  const notice = endNotice(outcome.trace.end);

  if (notice !== null) segments.push(notice);

  return segments;
}
