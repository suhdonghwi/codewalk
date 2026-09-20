import type { HTMLAttributes, PointerEvent } from "react";
import { useRef } from "react";

import { useCanvasStore } from "./store.ts";
import { resizedSize, type Size } from "./view.ts";

export interface ResizeAxes {
  x: boolean;
  y: boolean;
}

interface Resize {
  pointerId: number;
  clientX: number;
  clientY: number;
  start: Size;
}

type HandleProps = Pick<
  HTMLAttributes<HTMLDivElement>,
  | "onDoubleClick"
  | "onPointerCancel"
  | "onPointerDown"
  | "onPointerMove"
  | "onPointerUp"
>;

function windowSize(handle: HTMLElement): Size | null {
  const chrome = handle.closest<HTMLElement>("[data-window-chrome]");

  if (chrome === null) return null;
  const bounds = chrome.getBoundingClientRect();
  const scale = useCanvasStore.getState().view.scale;

  return { width: bounds.width / scale, height: bounds.height / scale };
}

/** Pointer handlers for one resize handle (an edge or the corner) of a window. */
export function useWindowResize(
  axes: ResizeAxes,
  minimum: Size,
  onResize: (size: Size, axes: ResizeAxes) => void,
  onReset: ((axes: ResizeAxes) => void) | undefined,
): HandleProps {
  const resize = useRef<Resize | null>(null);

  function start(event: PointerEvent<HTMLDivElement>): void {
    const size = windowSize(event.currentTarget);

    if (event.button !== 0 || size === null) return;
    resize.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      start: size,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function move(event: PointerEvent<HTMLDivElement>): void {
    const active = resize.current;

    if (active === null || active.pointerId !== event.pointerId) return;

    onResize(
      resizedSize(
        active.start,
        {
          x: event.clientX - active.clientX,
          y: event.clientY - active.clientY,
        },
        useCanvasStore.getState().view.scale,
        axes,
        minimum,
      ),
      axes,
    );
  }

  function end(event: PointerEvent<HTMLDivElement>): void {
    if (resize.current?.pointerId !== event.pointerId) return;
    resize.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    onDoubleClick:
      onReset === undefined
        ? undefined
        : () => {
            onReset(axes);
          },
    onPointerCancel: end,
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
  };
}
