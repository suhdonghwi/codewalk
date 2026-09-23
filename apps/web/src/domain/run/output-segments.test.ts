import type { End, OutputChunk, Trace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

import { outputSegments, type OutputSegment } from "./output-segments.ts";
import type { RunOutcome } from "./types.ts";

function traceOutcome(end: End, outputs: OutputChunk[] = []): RunOutcome {
  const trace: Trace = {
    header: { codewalk: 1, sources: [], locs: [] },
    nodes: [],
    outputs,
    root: null,
    end,
  };

  return { kind: "trace", trace };
}

interface OutputCase {
  name: string;
  outcome: RunOutcome;
  expected: OutputSegment[];
}

const cases: OutputCase[] = [
  {
    name: "keeps stdout and stderr chunks in order without an ok notice",
    outcome: traceOutcome({ status: "ok" }, [
      { node: 0, stream: "stdout", text: "one" },
      { node: 1, stream: "stderr", text: "two" },
    ]),
    expected: [
      { kind: "stdout", text: "one", chunk: 0 },
      { kind: "stderr", text: "two", chunk: 1 },
    ],
  },
  {
    name: "puts the traceback after output for an exception",
    outcome: traceOutcome(
      { status: "exception", traceback: "Traceback text" },
      [{ node: 0, stream: "stdout", text: "before\n" }],
    ),
    expected: [
      { kind: "stdout", text: "before\n", chunk: 0 },
      { kind: "notice", text: "Traceback text" },
    ],
  },
  {
    name: "uses the timeout notice",
    outcome: traceOutcome({ status: "timeout" }),
    expected: [{ kind: "notice", text: "Timed out" }],
  },
  {
    name: "uses the truncation notice",
    outcome: traceOutcome({ status: "truncated" }),
    expected: [{ kind: "notice", text: "Trace truncated" }],
  },
  {
    name: "uses the parser message for a syntax error",
    outcome: traceOutcome({
      status: "syntax_error",
      message: "invalid syntax",
      file: 0,
      start: 2,
      end: 3,
    }),
    expected: [{ kind: "notice", text: "invalid syntax" }],
  },
  {
    name: "formats the line and message for an invalid trace",
    outcome: {
      kind: "invalid",
      error: { kind: "schema", line: 7, message: "bad event" },
    },
    expected: [{ kind: "notice", text: "Invalid trace (line 7): bad event" }],
  },
  {
    name: "reports an unreachable server",
    outcome: { kind: "unreachable" },
    expected: [{ kind: "notice", text: "Could not reach the server" }],
  },
  {
    name: "reports a request the server rejected for its size",
    outcome: { kind: "failed", status: 413 },
    expected: [
      { kind: "notice", text: "The program or its input is too large to run" },
    ],
  },
  {
    name: "reports a gateway that could not reach the server as unreachable",
    outcome: { kind: "failed", status: 502 },
    expected: [{ kind: "notice", text: "Could not reach the server" }],
  },
  {
    name: "reports a server that failed to run the program",
    outcome: { kind: "failed", status: 500 },
    expected: [
      { kind: "notice", text: "The server could not run the program" },
    ],
  },
];

describe("outputSegments", () => {
  test.each(cases)("$name", ({ outcome, expected }) => {
    expect(outputSegments(outcome)).toEqual(expected);
  });
});
