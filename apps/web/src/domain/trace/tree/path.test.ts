import { readFileSync } from "node:fs";

import { parseTrace } from "@codewalk/trace";
import { describe, expect, test } from "vitest";

import {
  initialPath,
  pathColumns,
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

describe("trace paths", () => {
  test("opening the fact journey derives every child stack and toggling the nested call closes only its child", () => {
    const trace = fixture("fact");
    const paths: Path[] = [initialPath(trace)];

    paths.push(toggleSite(trace, paths.at(-1) ?? [], 0, 13));
    paths.push(selectSibling(paths.at(-1) ?? [], 1, 12));
    paths.push(toggleSite(trace, paths.at(-1) ?? [], 1, 19));
    paths.push(toggleSite(trace, paths.at(-1) ?? [], 2, 11));

    expect(paths).toEqual([[0], [0, 3], [0, 12], [0, 12, 16], [0, 12, 16, 23]]);
    expect(pathColumns(trace, paths[4] ?? [])).toEqual([
      { block: 0, blocks: [0], expandedIndex: 0, openSite: 13 },
      { block: 12, blocks: [3, 12], expandedIndex: 1, openSite: 19 },
      { block: 16, blocks: [16], expandedIndex: 0, openSite: 11 },
      { block: 23, blocks: [23], expandedIndex: 0, openSite: null },
    ]);
    expect(toggleSite(trace, paths[4] ?? [], 2, 11)).toEqual([0, 12, 16]);
  });

  test("switching a callback sibling truncates descendants and selecting it again preserves the path", () => {
    const trace = fixture("native_callback");
    const opened = toggleSite(trace, initialPath(trace), 0, 10);
    const withImpossibleDepth = [...opened, 99];
    const switched = selectSibling(withImpossibleDepth, 1, 9);

    expect(opened).toEqual([0, 5]);
    expect(switched).toEqual([0, 9]);
    expect(selectSibling(switched, 1, 9)).toBe(switched);
  });
});
