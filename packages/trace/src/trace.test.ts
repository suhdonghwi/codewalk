import { readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import {
  blockSites,
  exceptionOrigin,
  hasOutput,
  parseTrace,
  pathTo,
  statementStates,
} from "./index.ts";

import type { Role, Trace } from "./index.ts";

interface TestLoc {
  readonly role: Role;
  readonly kind: string;
  readonly file: number;
  readonly start: number;
  readonly end: number;
  readonly parent: number | null;
}

interface TestHeader {
  readonly codewalk: 1;
  readonly sources: readonly { readonly file: string; readonly text: string }[];
  readonly locs: readonly TestLoc[];
}

function loc(role: Role, parent: number | null, start = 0, end = 1): TestLoc {
  return { role, kind: role, file: 0, start, end, parent };
}

function header(locs: readonly TestLoc[], text = "x"): TestHeader {
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
  "../../../spec/fixtures/fact.trace.jsonl",
  import.meta.url,
);

test("the fact fixture builds the documented execution tree and output ownership", async () => {
  const trace = parsedTrace(await readFile(factFixtureUrl, "utf8"));

  expect(trace.end).toEqual({ status: "ok" });
  expect(trace.root).toBe(0);
  expect(trace.nodes).toHaveLength(28);
  expect(trace.nodes[0]?.children).toEqual([1, 2]);
  expect(trace.nodes[2]?.children).toEqual([3, 12]);
  expect(trace.outputs).toEqual([
    { node: 9, stream: "stdout", text: "fact 1\n" },
    { node: 5, stream: "stdout", text: "1\n" },
    { node: 18, stream: "stdout", text: "fact 2\n" },
    { node: 25, stream: "stdout", text: "fact 1\n" },
    { node: 14, stream: "stdout", text: "2\n" },
  ]);
  expect(hasOutput(trace, 0)).toBe(true);
  expect(hasOutput(trace, 1)).toBe(false);
});

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
    { loc: 4, nodes: [18], blocks: [], outputs: [2] },
    { loc: 10, nodes: [22], blocks: [23], outputs: [] },
  ]);
  expect(statementStates(trace, 16)).toEqual([
    { loc: 1, state: "inert" },
    { loc: 3, state: "lit" },
    { loc: 5, state: "lit" },
    { loc: 7, state: "dimmed" },
    { loc: 8, state: "lit" },
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

test("missing end and an unterminated partial final write both produce timeout", () => {
  const missingEnd = traceOf(header([loc("block", null)]), {
    op: "enter",
    loc: 0,
  });

  const partialFinalLine = `${missingEnd}{"op":`;

  const terminatedInvalidLine = `${missingEnd}{\n`;

  expect(parsedTrace(missingEnd).end).toEqual({ status: "timeout" });
  expect(parsedTrace(partialFinalLine).end).toEqual({ status: "timeout" });
  expect(parseTrace(terminatedInvalidLine)).toMatchObject({
    ok: false,
    error: { kind: "json", line: 3 },
  });
});

test("a syntax error end is valid without execution nodes", () => {
  const input = traceOf(header([], "bad"), {
    op: "end",
    status: "syntax_error",
    message: "invalid",
    file: 0,
    start: 0,
    end: 3,
  });

  const trace = parsedTrace(input);

  expect(trace.root).toBeNull();
  expect(trace.nodes).toEqual([]);
  expect(trace.end).toEqual({
    status: "syntax_error",
    message: "invalid",
    file: 0,
    start: 0,
    end: 3,
  });
});

test("boundary failures report their category and 1-based line", () => {
  const validHeader = header([loc("block", null)]);

  const cases = [
    { input: "", kind: "empty", line: 1 },
    { input: `${JSON.stringify(validHeader)}\n{\n`, kind: "json", line: 2 },
    {
      input: `${JSON.stringify(validHeader)}\n${JSON.stringify({ op: "end", status: "ok", extra: true })}\n`,
      kind: "schema",
      line: 2,
    },
  ];

  for (const example of cases) {
    expect(parseTrace(example.input)).toMatchObject({
      ok: false,
      error: { kind: example.kind, line: example.line },
    });
  }
});

describe("structural validation", () => {
  test("every malformed cross-reference or tree relationship reports its offending line", () => {
    const root = loc("block", null);
    const stmt = loc("stmt", 0);
    const expr = loc("expr", 1);

    const cases = [
      {
        name: "exit without open node",
        input: traceOf(header([root]), { op: "exit" }),
        line: 2,
      },
      {
        name: "output without open node",
        input: traceOf(header([root]), {
          op: "out",
          stream: "stdout",
          text: "x",
        }),
        line: 2,
      },
      {
        name: "enter loc out of range",
        input: traceOf(header([root]), { op: "enter", loc: 1 }),
        line: 2,
      },
      {
        name: "loc parent out of range",
        input: traceOf(header([loc("block", 1)])),
        line: 1,
      },
      {
        name: "loc file out of range",
        input: traceOf({
          codewalk: 1,
          sources: [{ file: "main.py", text: "x" }],
          locs: [
            {
              role: "block",
              kind: "block",
              file: 1,
              start: 0,
              end: 1,
              parent: null,
            },
          ],
        }),
        line: 1,
      },
      {
        name: "loc start after end",
        input: traceOf(header([loc("block", null, 1, 0)])),
        line: 1,
      },
      {
        name: "loc beyond source",
        input: traceOf(header([loc("block", null, 0, 2)])),
        line: 1,
      },
      {
        name: "loc parent cycle",
        input: traceOf(header([loc("block", 1), loc("stmt", 0)])),
        line: 1,
      },
      {
        name: "first enter is not a block",
        input: traceOf(header([root, stmt]), { op: "enter", loc: 1 }),
        line: 2,
      },
      {
        name: "block contains expr",
        input: traceOf(
          header([root, loc("expr", 0)]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
        ),
        line: 3,
      },
      {
        name: "stmt contains stmt",
        input: traceOf(
          header([root, stmt, loc("stmt", 1)]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "enter", loc: 2 },
        ),
        line: 4,
      },
      {
        name: "expr contains stmt",
        input: traceOf(
          header([root, stmt, expr, loc("stmt", 2)]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "enter", loc: 2 },
          { op: "enter", loc: 3 },
        ),
        line: 5,
      },
      {
        name: "exception on stmt exit",
        input: traceOf(
          header([root, stmt]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "exit", exc: "wrong" },
        ),
        line: 4,
      },
      {
        name: "event after end",
        input: traceOf(
          header([root]),
          { op: "end", status: "ok" },
          { op: "enter", loc: 0 },
        ),
        line: 3,
      },
    ];

    for (const example of cases) {
      expect(parseTrace(example.input), example.name).toMatchObject({
        ok: false,
        error: { kind: "structure", line: example.line },
      });
    }
  });
});
