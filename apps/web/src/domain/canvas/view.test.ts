import { describe, expect, test } from "vitest";

import {
  pinchedView,
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

test("a pinch keeps the world point between the fingers beneath them as they spread and move", () => {
  expect(
    pinchedView(
      { x: 0, y: 0, scale: 1 },
      [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
      ],
      [
        { x: 50, y: 200 },
        { x: 250, y: 200 },
      ],
    ),
  ).toEqual({ x: -150, y: 0, scale: 2 });
});

test("one wheel notch zooms no further than the per-event cap, equally in and out", () => {
  expect(wheelZoomFactor(-100)).toBeCloseTo(wheelZoomFactor(-25), 10);
  expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1, 10);
  expect(wheelZoomFactor(-100)).toBeLessThan(1.3);
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
