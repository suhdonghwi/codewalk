import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

import { buildBlockTitle, siblingListTitle } from "./block-title.ts";
import { buildBlockView, type BlockView } from "./block-view.ts";
import { previewInlineOutput } from "./inline-output.ts";

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

function line(view: BlockView, number: number) {
  const found = view.lines.find((candidate) => candidate.number === number);

  if (found === undefined) throw new Error(`Missing line ${number}`);

  return found;
}

function textWithValues(view: BlockView, number: number): string {
  return line(view, number)
    .spans.map((span) =>
      span.value === null ? span.text : `${span.text} = ${span.value}`,
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
        codewalk: 1,
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

    expect(line(view, 7).output).toEqual({
      segments: [
        { stream: "stdout", text: "generator\n" },
        { stream: "stdout", text: "1" },
      ],
    });
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

    expect(textWithValues(firstFactView, 1)).toBe("def fact(n = 1):");
    expect(textWithValues(secondFactView, 1)).toBe("def fact(n = 2):");
    expect(textWithValues(iterationView, 7)).toBe("for i = 0 in range(2):");
    expect(textWithValues(moduleView, 1)).toBe("def fact(n):");
    expect(textWithValues(moduleView, 7)).toBe("for i in range(2):");
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

  test("titles use trace labels, site indexes, entry values, and units", () => {
    const fact = fixture("fact");
    const iterations = blockNodes(fact, "iteration");
    const functions = blockNodes(fact, "fact");
    const secondIteration = iterations[1];
    const firstFunction = functions[0];

    if (secondIteration === undefined || firstFunction === undefined) {
      throw new Error("Missing fact fixture blocks");
    }

    expect(buildBlockTitle(fact, 0)).toEqual({
      text: "fact.py",
      hasException: false,
    });
    expect(buildBlockTitle(fact, secondIteration)).toEqual({
      text: "iteration 2 (i = 1)",
      hasException: false,
    });
    expect(buildBlockTitle(fact, firstFunction)).toEqual({
      text: "fact (n = 1)",
      hasException: false,
    });
    expect(siblingListTitle(fact, iterations)).toBe("2 iterations");

    const callbacks = fixture("native_callback");
    const callbackBlocks = blockNodes(callbacks, "key");

    expect(
      callbackBlocks.map((block) => buildBlockTitle(callbacks, block).text),
    ).toEqual(["key 1 (number = 1)", "key 2 (number = 2)"]);
  });
});

test.each([
  { text: "x".repeat(48), expected: "x".repeat(48), expandable: false },
  { text: "x".repeat(49), expected: `${"x".repeat(48)}…`, expandable: true },
  { text: "first\nsecond", expected: "first…", expandable: true },
])(
  "inline output preview truncates $text at the specified boundary",
  ({ text, expected, expandable }) => {
    const preview = previewInlineOutput({
      segments: [{ stream: "stdout", text }],
    });

    expect(preview).toEqual({
      segments: [{ stream: "stdout", text: expected }],
      expandable,
    });
  },
);
