import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

import {
  buildBlockTitle,
  siblingAfter,
  siblingCells,
  siblingColumns,
  siblingListTitle,
} from "./block-title.ts";
import {
  buildBlockView,
  type BlockView,
  type LineValue,
} from "./block-view.ts";
import { previewInlineOutput } from "./inline-output.ts";
import { sourceLines, trimCommonIndent } from "./source-lines.ts";
import { preview } from "./values.ts";

import type { NodeId, Trace } from "@codewalk/trace";

function fixture(name: string): Trace {
  const contents = readFileSync(
    new URL(
      `../../../../../../spec/fixtures/${name}.trace.jsonl`,
      import.meta.url,
    ),
    "utf8",
  );

  const parsed = parseTrace(contents);

  if (!parsed.ok) throw new Error(parsed.error.message);

  return parsed.trace;
}

function blockNodes(trace: Trace, title: string): NodeId[] {
  return trace.nodes.flatMap((node) => {
    const loc = trace.header.locs[node.loc];

    return loc?.role === "block" && loc.title === title ? [node.id] : [];
  });
}

function titleAmong(trace: Trace, blocks: NodeId[], block: NodeId) {
  return buildBlockTitle(trace, block, {
    index: blocks.indexOf(block),
    count: blocks.length,
  });
}

function line(view: BlockView, number: number) {
  const found = view.lines.find((candidate) => candidate.number === number);

  if (found === undefined) throw new Error(`Missing line ${number}`);

  return found;
}

function shown(trace: Trace, { value, at }: LineValue): string {
  return preview(trace, value, at, 80);
}

function textWithValues(trace: Trace, view: BlockView, number: number): string {
  return line(view, number)
    .spans.map((span) =>
      span.value === null
        ? span.text
        : `${span.text} = ${shown(trace, span.value)}`,
    )
    .join("");
}

describe("buildBlockView", () => {
  test("a nested iteration body is inert in its parent while the loop header stays lit", () => {
    const trace = fixture("fact");
    const view = buildBlockView(trace, 0, []);

    expect(line(view, 7).spans.map((span) => span.state)).toEqual(["lit"]);
    expect(line(view, 8).spans.every((span) => span.state === "inert")).toBe(
      true,
    );
  });

  test("a while condition belongs to each iteration, including the final failed check", () => {
    const trace = fixture("while_condition_call");
    const parent = buildBlockView(trace, 0, []);
    const [, lastIteration] = blockNodes(trace, "iteration");

    if (lastIteration === undefined) throw new Error("Missing iteration");
    const iteration = buildBlockView(trace, lastIteration, []);

    expect(line(parent, 7).spans.map((span) => span.sites)).toEqual([[10]]);
    expect(line(iteration, 7).spans.every((span) => span.state === "lit")).toBe(
      true,
    );
    expect(
      line(iteration, 7)
        .spans.filter((span) => span.sites.includes(13))
        .map((span) => span.text)
        .join(""),
    ).toBe("below(i, 1)");
    expect(
      line(iteration, 8).spans.find((span) => span.text.includes("i += 1"))
        ?.state,
    ).toBe("dimmed");
  });

  test("a clause header is lit only in the executions that entered its body", () => {
    const trace = fixture("clauses");
    const iterations = blockNodes(trace, "iteration");
    const root = trace.root;

    if (root === null) throw new Error("Missing fixture root");

    const headerStates = (block: NodeId, number: number) =>
      line(buildBlockView(trace, block, []), number)
        .spans.filter((span) => span.text.trim().length > 0)
        .map((span) => span.state);

    expect(
      iterations
        .slice(0, 3)
        .map((block) => [headerStates(block, 4)[0], headerStates(block, 6)[0]]),
    ).toEqual([
      ["dimmed", "dimmed"],
      ["lit", "dimmed"],
      ["lit", "lit"],
    ]);
    expect(
      [11, 13, 15, 20, 24, 26].map((number) => headerStates(root, number)[0]),
    ).toEqual(["lit", "dimmed", "lit", "lit", "lit", "dimmed"]);
  });

  test("a window drops the indentation all its lines share, and only that", () => {
    const source =
      "def search():\n    while lo < hi:\n        mid = lo\n\n        if mid:\n            lo = mid\n";

    const lines = trimCommonIndent(
      source,
      sourceLines(source, source.indexOf("while"), source.length - 1),
    );

    expect(lines.map(({ from, to }) => source.slice(from, to))).toEqual([
      "while lo < hi:",
      "    mid = lo",
      "",
      "    if mid:",
      "        lo = mid",
    ]);
  });

  test("an activation dims the branch it skipped and exposes the nested call it ran", () => {
    const trace = fixture("fact");
    const view = buildBlockView(trace, 16, []);

    expect(
      line(view, 4).spans.find((span) => span.text.includes("return"))?.state,
    ).toBe("dimmed");
    expect(
      line(view, 5)
        .spans.filter((span) => span.sites.includes(11))
        .map((span) => span.text)
        .join(""),
    ).toBe("fact(n - 1)");
  });

  test("token, statement, and nested site boundaries all split spans without losing site order", () => {
    const trace: Trace = {
      header: {
        codewalk: 2,
        plain: { sequence: "list", set: "set", mapping: "dict" },
        sources: [{ file: "boundaries.py", text: "abcdefgh" }],
        locs: [
          {
            role: "block",
            title: "boundaries.py",
            unit: "module",
            file: 0,
            start: 0,
            end: 8,
            parent: null,
          },
          {
            role: "stmt",
            file: 0,
            start: 0,
            end: 6,
            parent: 0,
          },
          {
            role: "expr",
            file: 0,
            start: 1,
            end: 5,
            parent: 1,
          },
          {
            role: "expr",
            file: 0,
            start: 2,
            end: 4,
            parent: 2,
          },
          {
            role: "block",
            title: "outer",
            unit: "call",
            file: 0,
            start: 1,
            end: 5,
            parent: 2,
          },
          {
            role: "block",
            title: "inner",
            unit: "call",
            file: 0,
            start: 2,
            end: 4,
            parent: 3,
          },
          {
            role: "stmt",
            file: 0,
            start: 6,
            end: 8,
            parent: 0,
          },
        ],
      },
      nodes: [
        {
          id: 0,
          loc: 0,
          parent: null,
          children: [1],
          outputs: [],
          values: [],
          exc: null,
        },
        {
          id: 1,
          loc: 1,
          parent: 0,
          children: [2],
          outputs: [],
          values: [],
          exc: null,
        },
        {
          id: 2,
          loc: 2,
          parent: 1,
          children: [4, 3],
          outputs: [],
          values: [],
          exc: null,
        },
        {
          id: 3,
          loc: 3,
          parent: 2,
          children: [5],
          outputs: [],
          values: [],
          exc: null,
        },
        {
          id: 4,
          loc: 4,
          parent: 2,
          children: [],
          outputs: [],
          values: [],
          exc: null,
        },
        {
          id: 5,
          loc: 5,
          parent: 3,
          children: [],
          outputs: [],
          values: [],
          exc: null,
        },
      ],
      outputs: [],
      objects: [],
      root: 0,
      end: { status: "ok" },
    };

    expect(
      buildBlockView(trace, 0, [
        { from: 0, to: 3, classes: "first" },
        { from: 3, to: 8, classes: "second" },
      ]).lines[0]?.spans,
    ).toEqual([
      { text: "a", classes: "first", state: "lit", sites: [], value: null },
      { text: "b", classes: "first", state: "lit", sites: [2], value: null },
      { text: "c", classes: "first", state: "lit", sites: [2, 3], value: null },
      {
        text: "d",
        classes: "second",
        state: "lit",
        sites: [2, 3],
        value: null,
      },
      { text: "e", classes: "second", state: "lit", sites: [2], value: null },
      { text: "f", classes: "second", state: "lit", sites: [], value: null },
      {
        text: "gh",
        classes: "second",
        state: "dimmed",
        sites: [],
        value: null,
      },
    ]);
  });

  test("outputs from several same-line sites stay in chunk order and lose only the final newline", () => {
    const trace = fixture("uninstrumented");
    const view = buildBlockView(trace, 0, []);

    expect(line(view, 7).output).toEqual([
      { stream: "stdout", text: "generator\n" },
      { stream: "stdout", text: "1" },
    ]);
  });

  test("values stay in their owning block and follow the exact anchor span", () => {
    const trace = fixture("fact");
    const [firstFact, secondFact] = blockNodes(trace, "fact");
    const [firstIteration] = blockNodes(trace, "iteration");

    if (
      firstFact === undefined ||
      secondFact === undefined ||
      firstIteration === undefined
    ) {
      throw new Error("Missing fact fixture blocks");
    }

    const firstFactView = buildBlockView(trace, firstFact, []);
    const secondFactView = buildBlockView(trace, secondFact, []);
    const iterationView = buildBlockView(trace, firstIteration, []);
    const moduleView = buildBlockView(trace, 0, []);

    expect(textWithValues(trace, firstFactView, 1)).toBe("def fact(n = 1):");
    expect(textWithValues(trace, secondFactView, 1)).toBe("def fact(n = 2):");
    expect(textWithValues(trace, iterationView, 7)).toBe(
      "for i = 0 in range(2):",
    );
    expect(textWithValues(trace, moduleView, 1)).toBe("def fact(n):");
    expect(textWithValues(trace, moduleView, 7)).toBe("for i in range(2):");
  });

  test("an iteration's inputs sit on its first line and each change on the line that made it", () => {
    const trace = fixture("loop_state");
    const [, secondSearch, , firstWord] = blockNodes(trace, "iteration");

    if (secondSearch === undefined || firstWord === undefined) {
      throw new Error("Missing loop_state iterations");
    }

    const search = buildBlockView(trace, secondSearch, []);
    const words = buildBlockView(trace, firstWord, []);

    expect(line(search, 3).values.map(({ name }) => name)).toEqual([
      "lo",
      "hi",
      "items",
      "target",
    ]);
    expect(
      search.lines.flatMap(({ number, changes }) =>
        changes.map(
          (change) => `${number}: ${change.name} → ${shown(trace, change)}`,
        ),
      ),
    ).toEqual(["4: mid → 1", "6: lo → 2"]);
    expect(
      line(words, 21).changes.map((change) => shown(trace, change)),
    ).toEqual(["['a']"]);
  });

  test("only the uncaught exception's deepest block marks its origin statement", () => {
    const uncaught = fixture("uncaught_exception");
    const functionBlock = blockNodes(uncaught, "fail")[0];

    if (functionBlock === undefined) throw new Error("Missing function block");

    expect(line(buildBlockView(uncaught, functionBlock, []), 2).exception).toBe(
      "RuntimeError: boom",
    );

    const caught = fixture("caught_exception");
    const root = caught.root;

    if (root === null) throw new Error("Missing fixture root");

    expect(
      buildBlockView(caught, root, []).lines.map(
        (candidate) => candidate.exception,
      ),
    ).not.toContain("ValueError: caught");
  });

  test("titles use trace labels, site indexes, and units", () => {
    const fact = fixture("fact");
    const iterations = blockNodes(fact, "iteration");
    const functions = blockNodes(fact, "fact");
    const secondIteration = iterations[1];
    const firstFunction = functions[0];

    if (secondIteration === undefined || firstFunction === undefined) {
      throw new Error("Missing fact fixture blocks");
    }

    expect(titleAmong(fact, [0], 0).text).toBe("fact.py");
    expect(titleAmong(fact, iterations, secondIteration).text).toBe(
      "iteration 2",
    );
    expect(titleAmong(fact, [firstFunction], firstFunction).text).toBe("fact");
    expect(siblingListTitle(fact, iterations)).toBe("2 iterations");

    const callbacks = fixture("native_callback");
    const callbackBlocks = blockNodes(callbacks, "key");

    expect(
      callbackBlocks.map(
        (block) => titleAmong(callbacks, callbackBlocks, block).text,
      ),
    ).toEqual(["key 1", "key 2"]);
  });

  test("a sibling column is as wide as its full preview, counting double-width characters twice", () => {
    const trace = fixture("unicode_offsets");
    const echoes = blockNodes(trace, "echo");

    expect(siblingColumns(trace, echoes)).toEqual([
      { name: "value", width: 9, carried: false },
    ]);
  });

  test("sibling columns keep only the values that differ between siblings, including ones some siblings lack", () => {
    const trace = fixture("loop_state");
    const iterations = blockNodes(trace, "iteration");
    const searchIterations = iterations.slice(0, 3);
    const lastIterations = iterations.slice(7, 9);

    expect(
      siblingColumns(trace, searchIterations).map(({ name }) => name),
    ).toEqual(["lo", "hi"]);
    expect(
      lastIterations.map((_, index) =>
        siblingCells(
          trace,
          lastIterations,
          index,
          siblingColumns(trace, lastIterations),
        ),
      ),
    ).toEqual([
      [
        { text: "3", repeated: false },
        { text: null, repeated: false },
      ],
      [
        { text: "1", repeated: false },
        { text: "3", repeated: false },
      ],
    ]);
    expect(
      siblingCells(
        trace,
        searchIterations,
        2,
        siblingColumns(trace, searchIterations),
      ),
    ).toEqual([
      { text: "2", repeated: false },
      { text: "2", repeated: true },
    ]);
  });
});

test("the after row shows a loop's end state only when its last iteration changed it", () => {
  const trace = fixture("loop_state");
  const iterations = blockNodes(trace, "iteration");
  const searchIterations = iterations.slice(0, 3);
  const wordIterations = iterations.slice(3, 7);

  expect(
    siblingAfter(trace, wordIterations, siblingColumns(trace, wordIterations)),
  ).toEqual([
    { text: null, repeated: false },
    { text: "['a', 'b', 'c']", repeated: false },
  ]);
  expect(
    siblingAfter(
      trace,
      searchIterations,
      siblingColumns(trace, searchIterations),
    ),
  ).toBeNull();
});

test("a variable that only the last iteration changes still gets a column and an after cell", () => {
  const trace = fixture("loop_state");
  const splitIterations = blockNodes(trace, "iteration").slice(9);
  const columns = siblingColumns(trace, splitIterations);

  expect(columns.map(({ name }) => name)).toEqual(["i", "heads", "tail"]);
  expect(siblingAfter(trace, splitIterations, columns)).toEqual([
    { text: null, repeated: false },
    { text: "[0, 1]", repeated: true },
    { text: "[2]", repeated: false },
  ]);
});

test.each([
  { text: "x".repeat(48), expected: "x".repeat(48), expandable: false },
  { text: "x".repeat(49), expected: `${"x".repeat(48)}…`, expandable: true },
  { text: "first\nsecond", expected: "first…", expandable: true },
])(
  "inline output preview truncates $text at the specified boundary",
  ({ text, expected, expandable }) => {
    const preview = previewInlineOutput([{ stream: "stdout", text }]);

    expect(preview).toEqual({
      segments: [{ stream: "stdout", text: expected }],
      expandable,
    });
  },
);
