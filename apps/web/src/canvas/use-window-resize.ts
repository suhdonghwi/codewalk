import type { HTMLAttributes, PointerEvent } from "react";
import { useRef } from "react";

import { useAppStore } from "@/state/store.ts";

import { resizedSize, type Size } from "./view.ts";

interface Resize {
  pointerId: number;
  clientX: number;
  clientY: number;
  start: Size;
}

type HandleProps = Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
>;

/** Pointer handlers for one resize handle (an edge or the corner) of a window. */
export function useWindowResize(
  axes: { x: boolean; y: boolean },
  minimum: Size,
  currentSize: () => Size,
  onResize: (size: Size) => void,
): HandleProps {
  const resize = useRef<Resize | null>(null);

  function start(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;
    resize.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      start: currentSize(),
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
        useAppStore.getState().view.scale,
        axes,
        minimum,
      ),
    );
  }

  function end(event: PointerEvent<HTMLDivElement>): void {
    if (resize.current?.pointerId !== event.pointerId) return;
    resize.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    onPointerCancel: end,
    onPointerDown: start,
    onPointerMove: move,
    onPointerUp: end,
  };
}
