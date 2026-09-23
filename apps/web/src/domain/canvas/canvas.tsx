import type { PointerEvent, ReactNode } from "react";
import { useEffect, useRef } from "react";

import { useCanvasStore } from "./store.ts";
import { pinchedView, wheelZoomFactor, zoomAboutPoint } from "./view.ts";

import type { Point, ViewTransform } from "./view.ts";

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

interface Pinch {
  pointerIds: [number, number];
  view: ViewTransform;
  points: [Point, Point];
}

type WheelRoute = "scroll" | "hold" | "pan";

function routeWheel(
  target: EventTarget | null,
  root: HTMLElement,
  deltaX: number,
  deltaY: number,
): WheelRoute {
  const vertical = Math.abs(deltaY) >= Math.abs(deltaX);
  const delta = vertical ? deltaY : deltaX;
  let element = target instanceof Element ? target : null;

  while (element !== null && element !== root) {
    if (element instanceof HTMLElement) {
      const style = getComputedStyle(element);
      const overflow = vertical ? style.overflowY : style.overflowX;
      const position = vertical ? element.scrollTop : element.scrollLeft;

      const limit = vertical
        ? element.scrollHeight - element.clientHeight
        : element.scrollWidth - element.clientWidth;

      if ((overflow === "auto" || overflow === "scroll") && limit > 0) {
        const canScroll = delta < 0 ? position > 0 : position < limit;

        return canScroll ? "scroll" : "hold";
      }
    }

    element = element.parentElement;
  }

  return "pan";
}

function canvasPoint(event: PointerEvent<HTMLElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();

  return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
}

export function Canvas({ children }: CanvasProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const pan = useRef<PanDrag | null>(null);
  const touches = useRef(new Map<number, Point>());
  const pinch = useRef<Pinch | null>(null);

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

      const route = routeWheel(
        event.target,
        canvasElement,
        event.deltaX,
        event.deltaY,
      );

      if (route === "scroll") return;

      event.preventDefault();

      if (route === "hold") return;

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

  function trackTouch(event: PointerEvent<HTMLDivElement>): void {
    if (event.pointerType !== "touch") return;
    touches.current.set(event.pointerId, canvasPoint(event));

    if (pinch.current !== null) {
      event.stopPropagation();

      return;
    }

    const [first, second, third] = touches.current.entries();

    if (first === undefined || second === undefined || third !== undefined) {
      return;
    }

    pinch.current = {
      pointerIds: [first[0], second[0]],
      view: useCanvasStore.getState().view,
      points: [first[1], second[1]],
    };
    pan.current = null;
    event.stopPropagation();
  }

  function moveTouch(event: PointerEvent<HTMLDivElement>): void {
    if (!touches.current.has(event.pointerId)) return;
    touches.current.set(event.pointerId, canvasPoint(event));
    const activePinch = pinch.current;

    if (activePinch === null) return;
    event.stopPropagation();
    const first = touches.current.get(activePinch.pointerIds[0]);
    const second = touches.current.get(activePinch.pointerIds[1]);

    if (first === undefined || second === undefined) return;
    useCanvasStore
      .getState()
      .setView(
        pinchedView(activePinch.view, activePinch.points, [first, second]),
      );
  }

  function releaseTouch(event: PointerEvent<HTMLDivElement>): void {
    touches.current.delete(event.pointerId);

    if (touches.current.size === 0) pinch.current = null;
  }

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
      onPointerCancelCapture={releaseTouch}
      onPointerDown={startPan}
      onPointerDownCapture={trackTouch}
      onPointerMove={continuePan}
      onPointerMoveCapture={moveTouch}
      onPointerUp={endPan}
      onPointerUpCapture={releaseTouch}
      ref={canvasRef}
    >
      <div className="absolute top-0 left-0 origin-top-left" ref={worldRef}>
        {children}
      </div>
    </main>
  );
}
