const MIN_SCALE = 0.25;

const MAX_SCALE = 2;

export interface Point {
  x: number;
  y: number;
}

export interface ViewTransform extends Point {
  scale: number;
}

export interface Viewport {
  width: number;
  height: number;
}

export interface Rect extends Point {
  width: number;
  height: number;
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

export function revealRect(
  view: ViewTransform,
  viewport: Viewport,
  rect: Rect,
  margin: number,
): ViewTransform {
  const left = view.x + rect.x * view.scale;
  const top = view.y + rect.y * view.scale;
  const right = left + rect.width * view.scale;
  const bottom = top + rect.height * view.scale;
  const rightLimit = viewport.width - margin;
  const bottomLimit = viewport.height - margin;

  const x =
    left < margin
      ? view.x + margin - left
      : right > rightLimit
        ? view.x + rightLimit - right
        : view.x;

  const y =
    top < margin
      ? view.y + margin - top
      : bottom > bottomLimit
        ? view.y + bottomLimit - bottom
        : view.y;

  return x === view.x && y === view.y ? view : { ...view, x, y };
}
