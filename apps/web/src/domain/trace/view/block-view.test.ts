import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

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

function blockNodes(trace: Trace, kind: string): NodeId[] {
  return trace.nodes.flatMap((node) =>
    trace.header.locs[node.loc]?.kind === kind ? [node.id] : [],
  );
}

function line(view: BlockView, number: number) {
  const found = view.lines.find((candidate) => candidate.number === number);

  if (found === undefined) throw new Error(`Missing line ${number}`);

  return found;
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

  test("an activation dims the branch it skipped and exposes the nested call it ran", () => {
    const trace = fixture("fact");
    const view = buildBlockView(trace, 16, []);

    expect(
      line(view, 4).spans.find((span) => span.text.includes("return"))?.state,
    ).toBe("dimmed");
    expect(
      line(view, 5)
        .spans.filter((span) => span.sites.includes(10))
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
            kind: "module",
            file: 0,
            start: 0,
            end: 8,
            parent: null,
          },
          {
            role: "stmt",
            kind: "expr",
            file: 0,
            start: 0,
            end: 6,
            parent: 0,
          },
          {
            role: "expr",
            kind: "call",
            file: 0,
            start: 1,
            end: 5,
            parent: 1,
          },
          {
            role: "expr",
            kind: "call",
            file: 0,
            start: 2,
            end: 4,
            parent: 2,
          },
          {
            role: "block",
            kind: "function",
            name: "outer",
            file: 0,
            start: 1,
            end: 5,
            parent: 2,
          },
          {
            role: "block",
            kind: "function",
            name: "inner",
            file: 0,
            start: 2,
            end: 4,
            parent: 3,
          },
          {
            role: "stmt",
            kind: "expr",
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
          exc: null,
          hasOutput: false,
        },
        {
          id: 1,
          loc: 1,
          parent: 0,
          children: [2],
          outputs: [],
          exc: null,
          hasOutput: false,
        },
        {
          id: 2,
          loc: 2,
          parent: 1,
          children: [4, 3],
          outputs: [],
          exc: null,
          hasOutput: false,
        },
        {
          id: 3,
          loc: 3,
          parent: 2,
          children: [5],
          outputs: [],
          exc: null,
          hasOutput: false,
        },
        {
          id: 4,
          loc: 4,
          parent: 2,
          children: [],
          outputs: [],
          exc: null,
          hasOutput: false,
        },
        {
          id: 5,
          loc: 5,
          parent: 3,
          children: [],
          outputs: [],
          exc: null,
          hasOutput: false,
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
      { text: "a", classes: "first", state: "lit", sites: [] },
      { text: "b", classes: "first", state: "lit", sites: [2] },
      { text: "c", classes: "first", state: "lit", sites: [2, 3] },
      { text: "d", classes: "second", state: "lit", sites: [2, 3] },
      { text: "e", classes: "second", state: "lit", sites: [2] },
      { text: "f", classes: "second", state: "lit", sites: [] },
      { text: "gh", classes: "second", state: "dimmed", sites: [] },
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

  test("only the uncaught exception's deepest block marks its origin statement", () => {
    const uncaught = fixture("uncaught_exception");
    const functionBlock = blockNodes(uncaught, "function")[0];

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

  test("titles use source names and zero-based indexes within their execution site", () => {
    const fact = fixture("fact");
    const iterations = blockNodes(fact, "iteration");

    expect(buildBlockView(fact, 0, []).title).toEqual({
      text: "fact.py",
      hasOutput: true,
      hasException: false,
    });
    expect(
      iterations.map((block) => buildBlockView(fact, block, []).title.text),
    ).toEqual(["iteration 0", "iteration 1"]);

    const callbacks = fixture("native_callback");
    const functions = blockNodes(callbacks, "function");

    expect(
      functions.map((block) => buildBlockView(callbacks, block, []).title.text),
    ).toEqual(["key · 0", "key · 1"]);
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
