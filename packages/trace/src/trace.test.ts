import { readdir, readFile } from "node:fs/promises";

import { describe, expect, test } from "vitest";

import { requireObject, parseTrace } from "./index.ts";

import type { Loc, Role, Trace } from "./index.ts";

interface TestHeader {
  readonly codewalk: 2;
  readonly literals: Trace["header"]["literals"];
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
  return {
    codewalk: 2,
    sources: [{ file: "main.py", text }],
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
  "../../../spec/fixtures/fact.trace.jsonl",
  import.meta.url,
);

test("every Python tracer fixture satisfies the trace parser contract", async () => {
  const fixturesUrl = new URL("../../../spec/fixtures/", import.meta.url);

  const names = (await readdir(fixturesUrl)).filter((name) =>
    name.endsWith(".trace.jsonl"),
  );

  for (const name of names) {
    const result = parseTrace(
      await readFile(new URL(name, fixturesUrl), "utf8"),
    );

    expect(result, name).toMatchObject({ ok: true });
  }
});

test("the fact fixture builds the documented execution tree and output and entry value ownership", async () => {
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
  expect(
    [3, 7, 12, 16, 23].map((block) =>
      trace.nodes[block]?.values.map(({ loc, name, value }) => ({
        loc,
        name,
        value,
      })),
    ),
  ).toEqual([
    [{ loc: 14, name: "i", value: { kind: "number", text: "0" } }],
    [{ loc: 3, name: "n", value: { kind: "number", text: "1" } }],
    [{ loc: 14, name: "i", value: { kind: "number", text: "1" } }],
    [{ loc: 3, name: "n", value: { kind: "number", text: "2" } }],
    [{ loc: 3, name: "n", value: { kind: "number", text: "1" } }],
  ]);
});

test("a reference resolves to the object as it was at its value event, including the objects it reaches", () => {
  const trace = parsedTrace(
    traceOf(
      header([loc("block", null)]),
      { op: "enter", loc: 0 },
      { op: "obj", id: 0, kind: "sequence", type: "list", items: [{ ref: 1 }] },
      { op: "obj", id: 1, kind: "sequence", type: "list", items: [] },
      { op: "value", name: "outer", value: { ref: 0 } },
      {
        op: "obj",
        id: 1,
        kind: "sequence",
        type: "list",
        items: [{ kind: "number", text: "1" }],
      },
      { op: "value", name: "outer", value: { ref: 0 } },
    ),
  );

  const inner = trace.nodes[0]?.values.map(({ at }) =>
    requireObject(trace, 1, at),
  );

  expect(inner).toEqual([
    { kind: "sequence", type: "list", items: [] },
    {
      kind: "sequence",
      type: "list",
      items: [{ kind: "number", text: "1" }],
    },
  ]);
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
    const number = { kind: "number", text: "1" };
    const list = { op: "obj", kind: "sequence", type: "list" };

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
          codewalk: 2,
          sources: [{ file: "main.py", text: "x" }],
          literals: {},
          locs: [
            {
              role: "block",
              title: "main.py",
              unit: "module",
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
        name: "exception on expr exit",
        input: traceOf(
          header([root, stmt, expr]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "enter", loc: 2 },
          { op: "exit", exc: "wrong" },
        ),
        line: 5,
      },
      {
        name: "jump on stmt exit",
        input: traceOf(
          header([root, stmt]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "exit", jump: "break" },
        ),
        line: 4,
      },
      {
        name: "value loc is not an expression",
        input: traceOf(
          header([root]),
          { op: "enter", loc: 0 },
          { op: "value", loc: 0, value: number },
        ),
        line: 3,
      },
      {
        name: "value loc is out of range",
        input: traceOf(
          header([root]),
          { op: "enter", loc: 0 },
          { op: "value", loc: 1, value: number },
        ),
        line: 3,
      },
      {
        name: "value without open node",
        input: traceOf(header([root, loc("expr", 0)]), {
          op: "value",
          loc: 1,
          value: number,
        }),
        line: 2,
      },
      {
        name: "value attached outside a block",
        input: traceOf(
          header([root, stmt, expr]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "value", loc: 2, value: number },
        ),
        line: 4,
      },
      {
        name: "named value inside an expression",
        input: traceOf(
          header([root, stmt, expr]),
          { op: "enter", loc: 0 },
          { op: "enter", loc: 1 },
          { op: "enter", loc: 2 },
          { op: "value", name: "x", value: number },
        ),
        line: 5,
      },
      {
        name: "object id skips ahead",
        input: traceOf(
          header([root]),
          { op: "enter", loc: 0 },
          { ...list, id: 1, items: [] },
        ),
        line: 3,
      },
      {
        name: "value refers to an undefined object",
        input: traceOf(
          header([root]),
          { op: "enter", loc: 0 },
          { op: "value", name: "x", value: { ref: 0 } },
        ),
        line: 3,
      },
      {
        name: "value follows an object that refers to an undefined object",
        input: traceOf(
          header([root]),
          { op: "enter", loc: 0 },
          { ...list, id: 0, items: [{ ref: 1 }] },
          { op: "value", name: "x", value: { ref: 0 } },
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
