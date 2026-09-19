import { describe, expect, test } from "vitest";

import { revealRect, wheelZoomFactor, zoomAboutPoint } from "./view.ts";

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

describe("revealRect", () => {
  test("keeps an already visible region fixed", () => {
    const view = { x: 20, y: 30, scale: 1 };

    expect(
      revealRect(
        view,
        { width: 800, height: 600 },
        { x: 100, y: 80, width: 240, height: 120 },
        48,
      ),
    ).toBe(view);
  });

  test("pans by only the overflow when a region is beyond the right and bottom margins", () => {
    expect(
      revealRect(
        { x: 0, y: 0, scale: 1 },
        { width: 800, height: 600 },
        { x: 700, y: 520, width: 240, height: 120 },
        48,
      ),
    ).toEqual({ x: -188, y: -88, scale: 1 });
  });

  test("accounts for canvas scale when revealing a region", () => {
    expect(
      revealRect(
        { x: 10, y: 20, scale: 0.5 },
        { width: 400, height: 300 },
        { x: 600, y: 500, width: 240, height: 120 },
        48,
      ),
    ).toEqual({ x: -68, y: -58, scale: 0.5 });
  });
});
