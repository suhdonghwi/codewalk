import { readFileSync } from "node:fs";

import { blockSites, parseTrace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

import {
  initialPath,
  pathColumn,
  selectSibling,
  toggleSite,
  type Path,
} from "./path.ts";

import type { Trace } from "@codewalk/trace";

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

function expectValidChain(trace: Trace, path: Path): void {
  for (let index = 1; index < path.length; index += 1) {
    const parent = path[index - 1];
    const child = path[index];

    if (parent === undefined || child === undefined) {
      throw new Error("Path unexpectedly contains a hole");
    }

    expect(
      blockSites(trace, parent).some((site) => site.blocks.includes(child)),
    ).toBe(true);
  }
}

describe("trace paths", () => {
  test("a trace starts at its root and a rootless trace starts with no windows", () => {
    const trace = fixture("fact");

    expect(initialPath(trace)).toEqual([0]);
    expect(initialPath({ ...trace, root: null })).toEqual([]);
  });

  test("opening the fact journey derives every child stack and toggling the nested call closes only its child", () => {
    const trace = fixture("fact");
    const paths: Path[] = [initialPath(trace)];

    paths.push(toggleSite(trace, paths.at(-1) ?? [], 0, 12));
    paths.push(selectSibling(paths.at(-1) ?? [], 1, 12));
    paths.push(toggleSite(trace, paths.at(-1) ?? [], 1, 17));
    paths.push(toggleSite(trace, paths.at(-1) ?? [], 2, 10));

    expect(paths).toEqual([[0], [0, 3], [0, 12], [0, 12, 16], [0, 12, 16, 23]]);
    expect(pathColumn(trace, paths[4] ?? [], 1)).toEqual({
      blocks: [3, 12],
      expandedIndex: 1,
      openSite: 17,
    });

    const closed = toggleSite(trace, paths[4] ?? [], 2, 10);

    expect(closed).toEqual([0, 12, 16]);

    for (const path of [...paths, closed]) expectValidChain(trace, path);
  });

  test("switching a callback sibling truncates descendants and selecting it again preserves the path", () => {
    const trace = fixture("native_callback");
    const opened = toggleSite(trace, initialPath(trace), 0, 9);
    const withImpossibleDepth = [...opened, 99];
    const switched = selectSibling(withImpossibleDepth, 1, 9);

    expect(opened).toEqual([0, 5]);
    expect(switched).toEqual([0, 9]);
    expect(selectSibling(switched, 1, 9)).toBe(switched);
    expectValidChain(trace, opened);
    expectValidChain(trace, switched);
  });
});
