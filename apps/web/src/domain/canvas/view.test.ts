import { describe, expect, test } from "vitest";

import {
  revealRect,
  revealWidth,
  resizedSize,
  wheelZoomFactor,
  zoomAboutPoint,
} from "./view.ts";

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

test.each([
  {
    name: "a window that fits is revealed whole",
    window: 500,
    scale: 1,
    expected: 500,
  },
  {
    name: "a window wider than the viewport is revealed as far as it fits",
    window: 2000,
    scale: 1,
    expected: 904,
  },
  {
    name: "zooming in shrinks what fits",
    window: 800,
    scale: 2,
    expected: 452,
  },
  {
    name: "a tiny viewport still reveals the minimum",
    window: 800,
    scale: 4,
    expected: 240,
  },
])("$name", ({ window, scale, expected }) => {
  expect(revealWidth(window, 1000, scale, 48, 240)).toBe(expected);
});

test.each([
  {
    name: "a corner drag at 200% moves the size by half the screen delta",
    delta: { x: 100, y: 60 },
    scale: 2,
    axes: { x: true, y: true },
    expected: { width: 610, height: 350 },
  },
  {
    name: "an edge drag leaves the other axis alone",
    delta: { x: 100, y: 60 },
    scale: 1,
    axes: { x: true, y: false },
    expected: { width: 660, height: 320 },
  },
  {
    name: "shrinking stops at the minimum size",
    delta: { x: -900, y: -900 },
    scale: 1,
    axes: { x: true, y: true },
    expected: { width: 320, height: 160 },
  },
])("$name", ({ delta, scale, axes, expected }) => {
  expect(
    resizedSize({ width: 560, height: 320 }, delta, scale, axes, {
      width: 320,
      height: 160,
    }),
  ).toEqual(expected);
});
