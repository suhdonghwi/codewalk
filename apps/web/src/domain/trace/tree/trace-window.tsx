import type { HTMLAttributes, ReactNode } from "react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";

import { useCanvasStore, WindowChrome } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import { TITLE_BAR, type Measurement } from "./layout.ts";
import {
  buildBlockTitle,
  type SiblingColumn,
  type SiblingPosition,
} from "../view/block-title.ts";
import { buildBlockView } from "../view/block-view.ts";
import { tokenizePython } from "../view/tokens.ts";
import { TraceLine } from "../view/trace-line.tsx";
import { requireBlock } from "../views.ts";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  position: SiblingPosition;
  columns: SiblingColumn[];
  openSite: LocId | null;
  column: number;
  width: number | null;
  height: number | null;
  resizeHandles: ReactNode;
  titlebarProps: HTMLAttributes<HTMLDivElement> | undefined;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (site: LocId) => void;
}

function measureWindow(
  element: HTMLElement,
): Omit<Measurement, "block" | "openSite"> {
  const bounds = element.getBoundingClientRect();
  const scale = useCanvasStore.getState().view.scale;
  const anchor = element.querySelector<HTMLElement>("[data-site-anchor]");
  const anchorBounds = anchor?.getBoundingClientRect();

  const height = bounds.height / scale;

  return {
    width: bounds.width / scale,
    anchorCenterY:
      anchorBounds === undefined
        ? null
        : Math.min(
            height,
            Math.max(
              TITLE_BAR,
              (anchorBounds.top + anchorBounds.height / 2 - bounds.top) / scale,
            ),
          ),
  };
}

export function titleIndicator(hasException: boolean) {
  return hasException ? (
    <span
      aria-hidden
      className="size-1.5 flex-none rounded-full bg-exception"
    />
  ) : null;
}

interface WindowBodyProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  fitsContent: boolean;
  onToggleSite: (site: LocId) => void;
}

function WindowBody({
  trace,
  block,
  openSite,
  fitsContent,
  onToggleSite,
}: WindowBodyProps) {
  const [hoveredSite, setHoveredSite] = useState<LocId | null>(null);
  const { source } = requireBlock(trace, block);
  const tokens = useMemo(() => tokenizePython(source), [source]);

  const view = useMemo(
    () => buildBlockView(trace, block, tokens),
    [trace, block, tokens],
  );

  const anchorLine =
    openSite === null
      ? null
      : (view.lines.find((line) =>
          line.spans.some((span) => span.sites.includes(openSite)),
        )?.number ?? null);

  return (
    <div
      className={cn(
        "code-surface min-h-0 overflow-auto",
        fitsContent && "max-w-trace",
      )}
    >
      <div className="grid w-max min-w-full grid-cols-[max-content_minmax(max-content,1fr)] py-2">
        <div
          aria-hidden
          className="sticky left-0 z-1 col-start-1 row-start-1 -my-2 box-content w-gutter border-r border-gutter-divider bg-white"
          style={{ gridRowEnd: `span ${view.lines.length}` }}
        />
        {view.lines.map((line, index) => (
          <TraceLine
            anchor={line.number === anchorLine}
            hoveredSite={hoveredSite}
            key={line.number}
            line={line}
            row={index + 1}
            onHoverSite={setHoveredSite}
            onToggleSite={onToggleSite}
            openSite={openSite}
          />
        ))}
      </div>
    </div>
  );
}

export function TraceWindow({
  trace,
  block,
  position,
  columns,
  openSite,
  column,
  width,
  height,
  resizeHandles,
  titlebarProps,
  onMeasure,
  onToggleSite,
}: TraceWindowProps) {
  const windowRef = useRef<HTMLElement>(null);
  const title = buildBlockTitle(trace, block, position, columns);

  useLayoutEffect(() => {
    const element = windowRef.current;

    if (element === null) return;

    const report = (): void => {
      onMeasure(column, { block, openSite, ...measureWindow(element) });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    element.addEventListener("scroll", report, {
      capture: true,
      passive: true,
    });

    return () => {
      observer.disconnect();
      element.removeEventListener("scroll", report, { capture: true });
    };
  }, [block, column, onMeasure, openSite]);

  return (
    <WindowChrome
      chromeRef={windowRef}
      className={cn(
        "flex max-h-max flex-col",
        width === null && "w-max max-w-trace",
      )}
      style={{ width: width ?? undefined, height: height ?? undefined }}
      title={title.text}
      titleIndicator={titleIndicator(title.hasException)}
      titlebarProps={titlebarProps}
    >
      <WindowBody
        block={block}
        fitsContent={width === null}
        onToggleSite={onToggleSite}
        openSite={openSite}
        trace={trace}
      />
      {resizeHandles}
    </WindowChrome>
  );
}
