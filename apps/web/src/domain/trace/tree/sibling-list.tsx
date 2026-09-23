import { useLayoutEffect, useRef, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import {
  buildBlockTitle,
  siblingCells,
  siblingListTitle,
  type SiblingCell,
  type SiblingColumn,
} from "../view/block-title.ts";
import { PreviewText } from "../view/preview-text.tsx";
import { requireBlock } from "../views.ts";
import { titleIndicator } from "./trace-window.tsx";

import type { KeyboardEvent } from "react";
import type { NodeId, Trace } from "@codewalk/trace";

const ROW_HEIGHT = 24;

const MAX_VISIBLE_ROWS = 10;

const OVERSCAN_ROWS = 4;

const MAX_LABEL_WIDTH = 24;

interface SiblingListProps {
  trace: Trace;
  blocks: NodeId[];
  columns: SiblingColumn[];
  after: SiblingCell[] | null;
  selectedIndex: number;
  onChoose: (block: NodeId) => void;
}

function Cells({
  cells,
  columns,
}: {
  cells: SiblingCell[];
  columns: SiblingColumn[];
}) {
  return cells.map((cell, column) => (
    <span
      className={cn(
        "whitespace-pre text-syntax-name",
        cell.repeated && "opacity-40",
      )}
      key={columns[column]?.name}
    >
      {cell.pieces === null ? null : <PreviewText pieces={cell.pieces} />}
    </span>
  ));
}

function gridTemplate(labelWidth: number, columns: SiblingColumn[]): string {
  return [
    `calc(${labelWidth}ch + 0.75rem)`,
    ...columns.map(({ width }) => `${width}ch`),
  ].join(" ");
}

function tableWidth(labelWidth: number, columns: SiblingColumn[]): string {
  const characters = columns.reduce(
    (total, { width }) => total + width + 2,
    labelWidth,
  );

  return `calc(${characters}ch + 1.75rem)`;
}

export function SiblingList({
  trace,
  blocks,
  columns,
  after,
  selectedIndex,
  onChoose,
}: SiblingListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const headerRows = columns.length > 0 ? 1 : 0;
  const headerHeight = headerRows * ROW_HEIGHT;
  const afterRows = after === null ? 0 : 1;
  const afterHeight = afterRows * ROW_HEIGHT;

  const contentHeight = (blocks.length + headerRows + afterRows) * ROW_HEIGHT;

  const viewportHeight = Math.min(
    contentHeight,
    (MAX_VISIBLE_ROWS + headerRows + afterRows) * ROW_HEIGHT,
  );

  useLayoutEffect(() => {
    const element = scrollRef.current;

    if (element === null) return;
    const rowTop = (selectedIndex + headerRows) * ROW_HEIGHT;

    if (!positioned.current) {
      element.scrollTop =
        rowTop -
        headerHeight -
        (viewportHeight - headerHeight - afterHeight - ROW_HEIGHT) / 2;
      positioned.current = true;
    } else if (rowTop < element.scrollTop + headerHeight) {
      element.scrollTop = rowTop - headerHeight;
    } else if (
      rowTop + ROW_HEIGHT >
      element.scrollTop + viewportHeight - afterHeight
    ) {
      element.scrollTop = rowTop + ROW_HEIGHT - viewportHeight + afterHeight;
    }

    setScrollTop(element.scrollTop);
  }, [selectedIndex, viewportHeight, headerRows, headerHeight, afterHeight]);

  function chooseNeighbour(event: KeyboardEvent<HTMLDivElement>): void {
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

    const neighbour = blocks[selectedIndex + step];

    if (step === 0 || neighbour === undefined) return;
    event.preventDefault();
    onChoose(neighbour);
  }

  const first = Math.max(
    0,
    Math.floor(scrollTop / ROW_HEIGHT) - headerRows - OVERSCAN_ROWS,
  );

  const end = Math.min(
    blocks.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
  );

  const firstBlock = blocks[0];

  const labelWidth = Math.min(
    MAX_LABEL_WIDTH,
    firstBlock === undefined
      ? 0
      : `${requireBlock(trace, firstBlock).loc.title} ${blocks.length}`.length,
  );

  const template = gridTemplate(labelWidth, columns);
  const row = "grid items-center gap-x-[2ch] px-2";

  return (
    <WindowChrome
      className="w-max max-w-trace min-w-30"
      title={siblingListTitle(trace, blocks)}
    >
      <div
        className="overflow-auto overscroll-contain font-code text-xs font-medium"
        data-sibling-list
        onKeyDown={chooseNeighbour}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
        }}
        ref={scrollRef}
        style={{ height: viewportHeight }}
      >
        <div
          className="relative flex flex-col"
          style={{
            height: contentHeight,
            minWidth: tableWidth(labelWidth, columns),
          }}
        >
          {headerRows === 0 ? null : (
            <div
              className={cn(
                row,
                "sticky top-0 z-1 border-b border-window-border bg-white text-neutral-400",
              )}
              style={{ gridTemplateColumns: template, height: ROW_HEIGHT }}
            >
              <span />
              {columns.map(({ name }) => (
                <span className="truncate" key={name}>
                  {name}
                </span>
              ))}
            </div>
          )}
          {blocks.slice(first, end).map((block, offset) => {
            const index = first + offset;

            const title = buildBlockTitle(trace, block, {
              index,
              count: blocks.length,
            });

            const selected = index === selectedIndex;

            return (
              <button
                aria-current={selected || undefined}
                className={cn(
                  row,
                  "absolute inset-x-0 cursor-pointer border-0 bg-transparent text-left text-neutral-500 outline-none",
                  selected
                    ? "bg-site-accent/12 text-neutral-800"
                    : "hover:bg-neutral-50 focus-visible:bg-neutral-50",
                )}
                data-block={block}
                key={block}
                onClick={() => {
                  onChoose(block);
                }}
                style={{
                  gridTemplateColumns: template,
                  top: (index + headerRows) * ROW_HEIGHT,
                  height: ROW_HEIGHT,
                }}
                type="button"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate">{title.text}</span>
                  {titleIndicator(title.hasException)}
                </span>
                <Cells
                  cells={siblingCells(trace, blocks, index, columns)}
                  columns={columns}
                />
              </button>
            );
          })}
          {after === null ? null : (
            <div
              className={cn(
                row,
                "sticky bottom-0 z-1 mt-auto flex-none border-t border-window-border bg-white text-neutral-400",
              )}
              style={{ gridTemplateColumns: template, height: ROW_HEIGHT }}
            >
              <span>after</span>
              <Cells cells={after} columns={columns} />
            </div>
          )}
        </div>
      </div>
    </WindowChrome>
  );
}
