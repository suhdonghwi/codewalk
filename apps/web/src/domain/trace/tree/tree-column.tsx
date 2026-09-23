import type { HTMLAttributes } from "react";
import { useLayoutEffect, useRef } from "react";

import { useCanvasStore } from "@/domain/canvas/index.ts";

import { SiblingList } from "./sibling-list.tsx";
import { TITLE_BAR, type Measurement } from "./layout.ts";
import { TraceWindow } from "./trace-window.tsx";
import { siblingAfter, siblingColumns } from "../view/sibling-table.ts";
import { blockTitle } from "../views.ts";

import type { PathColumn } from "./path.ts";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

function measureAnchor(windowElement: HTMLElement): number | null {
  const anchor = windowElement.querySelector<HTMLElement>("[data-site-anchor]");

  if (anchor === null) return null;

  const bounds = windowElement.getBoundingClientRect();
  const anchorBounds = anchor.getBoundingClientRect();
  const scale = useCanvasStore.getState().view.scale;
  const center = anchorBounds.top + anchorBounds.height / 2 - bounds.top;

  return Math.min(bounds.height / scale, Math.max(TITLE_BAR, center / scale));
}

interface TreeColumnProps {
  trace: Trace;
  column: PathColumn;
  columnIndex: number;
  top: number | undefined;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (site: LocId) => void;
  onChoose: (block: NodeId) => void;
  rootTitlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

export function TreeColumn({
  trace,
  column,
  columnIndex,
  top,
  onMeasure,
  onToggleSite,
  onChoose,
  rootTitlebarProps,
}: TreeColumnProps) {
  const columns = siblingColumns(trace, column.blocks);
  const windowRef = useRef<HTMLDivElement>(null);
  const { block, openSite } = column;

  useLayoutEffect(() => {
    const windowElement = windowRef.current;

    if (windowElement === null) return;

    const report = (): void => {
      onMeasure(columnIndex, {
        block: block.id,
        openSite,
        anchorCenterY: measureAnchor(windowElement),
      });
    };

    report();
    const observer = new ResizeObserver(report);
    observer.observe(windowElement);
    windowElement.addEventListener("scroll", report, {
      capture: true,
      passive: true,
    });

    return () => {
      observer.disconnect();
      windowElement.removeEventListener("scroll", report, { capture: true });
    };
  }, [block, columnIndex, onMeasure, openSite]);

  return (
    <div
      className="relative flex w-max flex-none items-start gap-2"
      style={{
        marginTop: top ?? 0,
        visibility: top === undefined ? "hidden" : "visible",
      }}
    >
      {columnIndex === 0 ? null : (
        <div
          aria-hidden
          className="pointer-events-none absolute top-[calc(var(--spacing-titlebar)/2)] right-full h-[1.5px] w-16 -translate-y-1/2 animate-tree-fade-in bg-site-accent/60"
          key={`edge:${block.id}`}
        />
      )}
      {column.blocks.length > 1 ? (
        <div
          className="animate-tree-fade-in"
          key={`siblings:${column.blocks[0]?.id}`}
        >
          <SiblingList
            after={siblingAfter(trace, column.blocks, columns)}
            blocks={column.blocks}
            columns={columns}
            onChoose={onChoose}
            selectedIndex={column.expandedIndex}
            trace={trace}
          />
        </div>
      ) : null}
      <div
        className="animate-tree-fade-in"
        data-block={block.id}
        key={block.id}
        ref={windowRef}
      >
        <TraceWindow
          block={block}
          onToggleSite={onToggleSite}
          openSite={openSite}
          title={blockTitle(block, column.expandedIndex, column.blocks.length)}
          titlebarProps={columnIndex === 0 ? rootTitlebarProps : undefined}
          trace={trace}
          varyingNames={columns.map(({ name }) => name)}
        />
      </div>
    </div>
  );
}
