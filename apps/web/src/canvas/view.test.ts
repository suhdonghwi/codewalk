import { describe, expect, test } from "vitest";

import { wheelZoomFactor, zoomAboutPoint } from "./view.ts";

describe("zoomAboutPoint", () => {
  test("keeps the world point beneath the cursor fixed while zooming", () => {
    expect(
      zoomAboutPoint({ x: 100, y: 50, scale: 1 }, { x: 300, y: 250 }, 2),
    ).toEqual({ x: -100, y: -150, scale: 2 });
  });

  test.each([
    {
      name: "the lower limit",
      requested: 0.1,
      expected: { x: 250, y: 200, scale: 0.25 },
    },
    {
      name: "the upper limit",
      requested: 3,
      expected: { x: -100, y: -150, scale: 2 },
    },
  ])("clamps zoom to $name", ({ requested, expected }) => {
    expect(
      zoomAboutPoint(
        { x: 100, y: 50, scale: 1 },
        { x: 300, y: 250 },
        requested,
      ),
    ).toEqual(expected);
  });
});

test("one wheel notch zooms no further than the per-event cap, equally in and out", () => {
  expect(wheelZoomFactor(-100)).toBeCloseTo(wheelZoomFactor(-25), 10);
  expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
  expect(wheelZoomFactor(-100)).toBeLessThan(1.3);
});
