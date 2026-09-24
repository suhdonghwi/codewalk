import { readFile } from "node:fs/promises";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import {
  blockPath,
  exceptionOrigin,
  requireNode,
  statementStates,
} from "./views.ts";

import type { Loc, Trace } from "@codewalk/trace";

interface TestHeader {
  readonly codewalk: 3;
  readonly literals: Trace["literals"];
  readonly source: { readonly file: string; readonly text: string };
  readonly locs: readonly Loc[];
}

function loc(
  role: Loc["role"],
  parent: number | null,
  start = 0,
  end = 1,
): Loc {
  return role === "block"
    ? { role, title: "main.py", unit: "module", start, end, parent }
    : { role, start, end, parent };
}

function header(locs: readonly Loc[], text = "x"): TestHeader {
  return {
    codewalk: 3,
    source: { file: "main.py", text },
    literals: {},
    locs,
  };
}

function traceOf<Event>(
  traceHeader: TestHeader,
  ...events: readonly Event[]
): string {
  const lines = [JSON.stringify(traceHeader)];

  for (const event of events) lines.push(JSON.stringify(event));

  return `${lines.join("\n")}\n`;
}

function parsedTrace(input: string): Trace {
  const result = parseTrace(input);

  if (!result.ok) throw new Error(result.error.message);

  return result.trace;
}

const factFixtureUrl = new URL(
  "../../../../../spec/fixtures/fact.trace.jsonl",
  import.meta.url,
);

test("the fact fixture produces the documented paths and statement states", async () => {
  const trace = parsedTrace(await readFile(factFixtureUrl, "utf8"));

  expect(blockPath(requireNode(trace, 25))).toEqual([0, 12, 16, 23]);
  expect(blockPath(requireNode(trace, 23))).toEqual([0, 12, 16, 23]);
  expect(
    statementStates(trace, requireNode(trace, 16)).map(({ loc, state }) => ({
      loc: loc.id,
      state,
    })),
  ).toEqual([
    { loc: 1, state: "inert" },
    { loc: 4, state: "lit" },
    { loc: 6, state: "lit" },
    { loc: 8, state: "dimmed" },
    { loc: 9, state: "lit" },
  ]);
  expect(exceptionOrigin(trace)).toBeNull();
});

test("exception origin follows propagation but ignores an earlier caught exception", () => {
  const exceptionHeader = header([
    loc("block", null),
    loc("stmt", 0),
    loc("expr", 1),
    loc("block", 2),
    loc("stmt", 3),
    loc("stmt", 0),
  ]);

  const propagated = traceOf(
    exceptionHeader,
    { op: "enter", loc: 0 },
    { op: "enter", loc: 1 },
    { op: "enter", loc: 2 },
    { op: "enter", loc: 3 },
    { op: "enter", loc: 4 },
    { op: "exit" },
    { op: "exit", exc: "ValueError: child" },
    { op: "exit" },
    { op: "exit" },
    { op: "exit", exc: "ValueError: child" },
    { op: "end", status: "exception", traceback: "traceback" },
  );

  const caughtThenRaised = traceOf(
    exceptionHeader,
    { op: "enter", loc: 0 },
    { op: "enter", loc: 1 },
    { op: "enter", loc: 2 },
    { op: "enter", loc: 3 },
    { op: "enter", loc: 4 },
    { op: "exit" },
    { op: "exit", exc: "ValueError: caught" },
    { op: "exit" },
    { op: "exit" },
    { op: "enter", loc: 5 },
    { op: "exit" },
    { op: "exit", exc: "RuntimeError: later" },
    { op: "end", status: "exception", traceback: "traceback" },
  );

  const withoutStatement = traceOf(
    header([loc("block", null)]),
    { op: "enter", loc: 0 },
    { op: "exit", exc: "RuntimeError: empty" },
    { op: "end", status: "exception", traceback: "traceback" },
  );

  expect(exceptionOrigin(parsedTrace(propagated))?.id).toBe(4);
  expect(exceptionOrigin(parsedTrace(caughtThenRaised))?.id).toBe(5);
  expect(exceptionOrigin(parsedTrace(withoutStatement))?.id).toBe(0);
});
