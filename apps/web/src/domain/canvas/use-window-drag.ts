import type { HTMLAttributes, PointerEvent } from "react";
import { useRef } from "react";

import { useCanvasStore, type WindowId } from "./store.ts";

interface WindowDrag {
  pointerId: number;
  clientX: number;
  clientY: number;
  windowX: number;
  windowY: number;
}

type TitlebarProps = Pick<
  HTMLAttributes<HTMLDivElement>,
  "onPointerCancel" | "onPointerDown" | "onPointerMove" | "onPointerUp"
>;

export function useWindowDrag(id: WindowId): TitlebarProps {
  const drag = useRef<WindowDrag | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;

    if (
      event.target instanceof Element &&
      event.target.closest("[data-window-control]") !== null
    ) {
      return;
    }

    const position = useCanvasStore.getState().windows[id];
    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      windowX: position.x,
      windowY: position.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>): void {
    const activeDrag = drag.current;

    if (activeDrag === null || activeDrag.pointerId !== event.pointerId) return;

    const state = useCanvasStore.getState();
    state.moveWindow(
      id,
      activeDrag.windowX +
        (event.clientX - activeDrag.clientX) / state.view.scale,
      activeDrag.windowY +
        (event.clientY - activeDrag.clientY) / state.view.scale,
    );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return {
    onPointerCancel: endDrag,
    onPointerDown: startDrag,
    onPointerMove: continueDrag,
    onPointerUp: endDrag,
  };
}
