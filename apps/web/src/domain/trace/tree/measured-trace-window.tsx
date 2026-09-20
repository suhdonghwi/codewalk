import { useLayoutEffect, useRef } from "react";

import { useCanvasStore } from "@/domain/canvas/index.ts";

import { TraceWindow } from "../view/trace-window.tsx";

import type { HTMLAttributes } from "react";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

export interface Measurement {
  block: NodeId;
  openSite: LocId | null;
  width: number;
  height: number;
  anchorCenterY: number | null;
}

interface MeasuredTraceWindowProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  column: number;
  className: string;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (site: LocId) => void;
  titlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
  titlebarClassName?: string | undefined;
}

function measureWindow(
  element: HTMLElement,
): Omit<Measurement, "block" | "openSite"> {
  const bounds = element.getBoundingClientRect();
  const scale = useCanvasStore.getState().view.scale;
  const anchor = element.querySelector<HTMLElement>("[data-site-anchor]");
  const anchorBounds = anchor?.getBoundingClientRect();

  return {
    width: bounds.width / scale,
    height: bounds.height / scale,
    anchorCenterY:
      anchorBounds === undefined
        ? null
        : (anchorBounds.top + anchorBounds.height / 2 - bounds.top) / scale,
  };
}

export function MeasuredTraceWindow({
  trace,
  block,
  openSite,
  column,
  className,
  onMeasure,
  onToggleSite,
  titlebarProps,
  titlebarClassName,
}: MeasuredTraceWindowProps) {
  const windowRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const element = windowRef.current;

    if (element === null) return;

    const report = (): void => {
      onMeasure(column, { block, openSite, ...measureWindow(element) });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [block, column, onMeasure, openSite]);

  return (
    <TraceWindow
      block={block}
      chromeRef={windowRef}
      className={className}
      expanded
      onToggleSite={onToggleSite}
      openSite={openSite}
      titlebarProps={titlebarProps}
      titlebarClassName={titlebarClassName}
      trace={trace}
    />
  );
}

export function sameMeasurement(
  left: Measurement | undefined,
  right: Measurement,
): boolean {
  return (
    left?.block === right.block &&
    left.openSite === right.openSite &&
    left.width === right.width &&
    left.height === right.height &&
    left.anchorCenterY === right.anchorCenterY
  );
}
