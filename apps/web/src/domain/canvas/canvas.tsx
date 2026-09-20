import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useCanvasStore } from "./store.ts";
import { wheelZoomFactor, zoomAboutPoint } from "./view.ts";

const GRID_PITCH = 24;

interface CanvasProps {
  children: ReactNode;
}

interface PanDrag {
  pointerId: number;
  clientX: number;
  clientY: number;
  viewX: number;
  viewY: number;
}

function canScrollAxis(
  delta: number,
  position: number,
  scrollSize: number,
  clientSize: number,
): boolean {
  if (delta < 0) return position > 0;

  if (delta > 0) return position < scrollSize - clientSize;

  return false;
}

function scrollableAncestorCanConsume(
  target: EventTarget | null,
  root: HTMLElement,
  deltaX: number,
  deltaY: number,
): boolean {
  let element = target instanceof Element ? target : null;

  while (element !== null && element !== root) {
    if (element instanceof HTMLElement) {
      const style = getComputedStyle(element);

      const scrollsX =
        style.overflowX === "auto" || style.overflowX === "scroll";

      const scrollsY =
        style.overflowY === "auto" || style.overflowY === "scroll";

      if (
        (scrollsX &&
          canScrollAxis(
            deltaX,
            element.scrollLeft,
            element.scrollWidth,
            element.clientWidth,
          )) ||
        (scrollsY &&
          canScrollAxis(
            deltaY,
            element.scrollTop,
            element.scrollHeight,
            element.clientHeight,
          ))
      ) {
        return true;
      }
    }

    element = element.parentElement;
  }

  return false;
}

export function Canvas({ children }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pan = useRef<PanDrag | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const world = worldRef.current;

    if (canvas === null || world === null) return;
    const canvasElement: HTMLDivElement = canvas;
    const worldElement: HTMLDivElement = world;

    function applyView(): void {
      const view = useCanvasStore.getState().view;
      worldElement.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      canvasElement.style.backgroundPosition = `${view.x}px ${view.y}px`;
      canvasElement.style.backgroundSize = `${GRID_PITCH * view.scale}px ${GRID_PITCH * view.scale}px`;
    }

    function onWheel(event: WheelEvent): void {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault();
        const bounds = canvasElement.getBoundingClientRect();
        const view = useCanvasStore.getState().view;

        const point = {
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
        };

        const requestedScale = view.scale * wheelZoomFactor(event.deltaY);
        useCanvasStore
          .getState()
          .setView(zoomAboutPoint(view, point, requestedScale));

        return;
      }

      if (
        scrollableAncestorCanConsume(
          event.target,
          canvasElement,
          event.deltaX,
          event.deltaY,
        )
      ) {
        return;
      }

      event.preventDefault();
      const view = useCanvasStore.getState().view;
      useCanvasStore.getState().setView({
        ...view,
        x: view.x - event.deltaX,
        y: view.y - event.deltaY,
      });
    }

    applyView();

    const unsubscribe = useCanvasStore.subscribe((state, previous) => {
      if (state.view !== previous.view) applyView();
    });

    canvasElement.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      unsubscribe();
      canvasElement.removeEventListener("wheel", onWheel);
    };
  }, []);

  function startPan(event: PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || event.target !== event.currentTarget) return;
    const view = useCanvasStore.getState().view;
    pan.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      viewX: view.x,
      viewY: view.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continuePan(event: PointerEvent<HTMLDivElement>): void {
    const activePan = pan.current;

    if (activePan === null || activePan.pointerId !== event.pointerId) return;
    const view = useCanvasStore.getState().view;
    useCanvasStore.getState().setView({
      ...view,
      x: activePan.viewX + event.clientX - activePan.clientX,
      y: activePan.viewY + event.clientY - activePan.clientY,
    });
  }

  function endPan(event: PointerEvent<HTMLDivElement>): void {
    if (pan.current?.pointerId !== event.pointerId) return;
    pan.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <main
      className="canvas-dots relative size-full touch-none overflow-hidden bg-neutral-50"
      data-canvas
      onPointerCancel={endPan}
      onPointerDown={startPan}
      onPointerMove={continuePan}
      onPointerUp={endPan}
      ref={canvasRef}
    >
      <div className="absolute top-0 left-0 origin-top-left" ref={worldRef}>
        {children}
      </div>
    </main>
  );
}
