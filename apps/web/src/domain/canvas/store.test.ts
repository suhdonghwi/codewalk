import { expect, test } from "vitest";

import { initialView } from "./store.ts";

test.each([
  { name: "a wide screen keeps the full layout", width: 1280, x: 368 },
  { name: "a medium screen shows the editor's right edge", width: 700, x: 236 },
  { name: "a phone keeps the editor's left edge on screen", width: 360, x: 16 },
])("$name", ({ width, x }) => {
  expect(initialView(width).x).toBe(x);
});
