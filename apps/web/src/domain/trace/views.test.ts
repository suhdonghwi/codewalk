import { readFile } from "node:fs/promises";

import { parseTrace } from "@codewalk/trace";
import { expect, test } from "vitest";

import {
  blockSites,
  exceptionOrigin,
  pathTo,
  statementStates,
} from "./views.ts";

import type { Loc, Role, Trace } from "@codewalk/trace";

interface TestHeader {
  readonly codewalk: 1;
  readonly sources: readonly { readonly file: string; readonly text: string }[];
  readonly locs: readonly Loc[];
}

function loc(role: Role, parent: number | null, start = 0, end = 1): Loc {
  return role === "block"
    ? {
        role,
        title: "main.py",
        unit: "module",
        file: 0,
        start,
        end,
        parent,
      }
    : { role, file: 0, start, end, parent };
}

function header(locs: readonly Loc[], text = "x"): TestHeader {
  return { codewalk: 1, sources: [{ file: "main.py", text }], locs };
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

test("the fact fixture produces the documented paths, sites, and statement states", async () => {
  const trace = parsedTrace(await readFile(factFixtureUrl, "utf8"));

  expect(pathTo(trace, 25)).toEqual([
    { block: 0, site: 2 },
    { block: 12, site: 15 },
    { block: 16, site: 22 },
    { block: 23, site: 25 },
  ]);
  expect(pathTo(trace, 23)).toEqual([
    { block: 0, site: 2 },
    { block: 12, site: 15 },
    { block: 16, site: 22 },
    { block: 23, site: null },
  ]);
  expect(blockSites(trace, 16)).toEqual([
    { loc: 5, nodes: [18], blocks: [], outputs: [2] },
    { loc: 11, nodes: [22], blocks: [23], outputs: [] },
  ]);
  expect(statementStates(trace, 16)).toEqual([
    { loc: 1, state: "inert" },
    { loc: 4, state: "lit" },
    { loc: 6, state: "lit" },
    { loc: 8, state: "dimmed" },
    { loc: 9, state: "lit" },
  ]);
  expect(exceptionOrigin(trace)).toBeNull();
});

test("sites merge repeated executions of one loc in execution order", () => {
  const input = traceOf(
    header([
      loc("block", null),
      loc("stmt", 0),
      loc("expr", 1),
      loc("block", 2),
    ]),
    { op: "enter", loc: 0 },
    { op: "enter", loc: 1 },
    { op: "enter", loc: 2 },
    { op: "out", stream: "stdout", text: "first" },
    { op: "exit" },
    { op: "enter", loc: 2 },
    { op: "enter", loc: 3 },
    { op: "exit" },
    { op: "exit" },
    { op: "exit" },
    { op: "exit" },
    { op: "end", status: "ok" },
  );

  expect(blockSites(parsedTrace(input), 0)).toEqual([
    { loc: 2, nodes: [2, 3], blocks: [4], outputs: [0] },
  ]);
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

  expect(exceptionOrigin(parsedTrace(propagated))).toEqual({
    block: 3,
    stmt: 4,
  });
  expect(exceptionOrigin(parsedTrace(caughtThenRaised))).toEqual({
    block: 0,
    stmt: 5,
  });
  expect(exceptionOrigin(parsedTrace(withoutStatement))).toEqual({
    block: 0,
    stmt: null,
  });
});
