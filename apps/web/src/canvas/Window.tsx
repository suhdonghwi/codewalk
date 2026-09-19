import type { PointerEvent, ReactNode } from "react";
import { useRef } from "react";

import { useAppStore, type WindowId } from "@/state/store.ts";

interface CanvasWindowProps {
  id: WindowId;
  title: string;
  titleAction?: ReactNode;
  className: string;
  children: ReactNode;
}

interface WindowDrag {
  pointerId: number;
  clientX: number;
  clientY: number;
  windowX: number;
  windowY: number;
}

export function CanvasWindow({
  id,
  title,
  titleAction,
  className,
  children,
}: CanvasWindowProps) {
  const windowState = useAppStore((state) => state.windows[id]);
  const drag = useRef<WindowDrag | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) return;

    if (
      event.target instanceof Element &&
      event.target.closest("[data-window-control]") !== null
    ) {
      return;
    }

    drag.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      windowX: windowState.x,
      windowY: windowState.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function continueDrag(event: PointerEvent<HTMLDivElement>): void {
    const activeDrag = drag.current;

    if (activeDrag === null || activeDrag.pointerId !== event.pointerId) return;

    const scale = useAppStore.getState().view.scale;
    useAppStore
      .getState()
      .moveWindow(
        id,
        activeDrag.windowX + (event.clientX - activeDrag.clientX) / scale,
        activeDrag.windowY + (event.clientY - activeDrag.clientY) / scale,
      );
  }

  function endDrag(event: PointerEvent<HTMLDivElement>): void {
    if (drag.current?.pointerId !== event.pointerId) return;
    drag.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <section
      className={`canvas-window ${className}`}
      onPointerDown={() => useAppStore.getState().bringToFront(id)}
      style={{
        left: windowState.x,
        top: windowState.y,
        zIndex: windowState.z,
      }}
    >
      <div
        className="window-titlebar"
        onPointerCancel={endDrag}
        onPointerDown={startDrag}
        onPointerMove={continueDrag}
        onPointerUp={endDrag}
      >
        <span>{title}</span>
        {titleAction}
      </div>
      {children}
    </section>
  );
}
