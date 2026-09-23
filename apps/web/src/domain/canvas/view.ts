const MIN_SCALE = 0.25;

const MAX_SCALE = 2;

export interface Point {
  x: number;
  y: number;
}

export interface ViewTransform extends Point {
  scale: number;
}

// Trackpad pinches arrive as many small deltas (~1–10), a mouse wheel as one
// large delta (~100) per notch. The sensitivity suits the pinch; the cap keeps a
// single wheel notch from jumping more than ~28%.
const ZOOM_SENSITIVITY = 0.01;

const MAX_ZOOM_DELTA = 25;

export function wheelZoomFactor(deltaY: number): number {
  const delta = Math.min(MAX_ZOOM_DELTA, Math.max(-MAX_ZOOM_DELTA, deltaY));

  return Math.exp(-delta * ZOOM_SENSITIVITY);
}

function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function zoomAboutPoint(
  view: ViewTransform,
  point: Point,
  requestedScale: number,
): ViewTransform {
  const scale = clampScale(requestedScale);
  const worldX = (point.x - view.x) / view.scale;
  const worldY = (point.y - view.y) / view.scale;

  return {
    x: point.x - worldX * scale,
    y: point.y - worldY * scale,
    scale,
  };
}

function midpoint([a, b]: [Point, Point]): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function distance([a, b]: [Point, Point]): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function pinchedView(
  view: ViewTransform,
  from: [Point, Point],
  to: [Point, Point],
): ViewTransform {
  const start = midpoint(from);
  const end = midpoint(to);

  const zoomed = zoomAboutPoint(
    view,
    start,
    (view.scale * distance(to)) / Math.max(1, distance(from)),
  );

  return {
    ...zoomed,
    x: zoomed.x + end.x - start.x,
    y: zoomed.y + end.y - start.y,
  };
}
