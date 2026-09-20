import { useLayoutEffect, useRef, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import { SIBLING_LIST_WIDTH } from "./layout.ts";
import { buildBlockTitle, siblingListTitle } from "../view/block-view.ts";
import { titleIndicator } from "../view/trace-window.tsx";

import type { KeyboardEvent } from "react";
import type { NodeId, Trace } from "@codewalk/trace";

const ROW_HEIGHT = 24;

const MAX_VISIBLE_ROWS = 10;

const OVERSCAN_ROWS = 4;

interface SiblingListProps {
  trace: Trace;
  blocks: NodeId[];
  selectedIndex: number;
  onChoose: (block: NodeId) => void;
}

/**
 * All child blocks of one site, the selected one highlighted. The list has a
 * fixed position and a bounded height and scrolls inside, so choosing a sibling
 * never moves anything on the canvas. Rows are windowed: a loop can have
 * thousands of iterations.
 */
export function SiblingList({
  trace,
  blocks,
  selectedIndex,
  onChoose,
}: SiblingListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const positioned = useRef(false);
  const [scrollTop, setScrollTop] = useState(0);
  const viewportHeight = Math.min(blocks.length, MAX_VISIBLE_ROWS) * ROW_HEIGHT;

  useLayoutEffect(() => {
    const element = scrollRef.current;

    if (element === null) return;
    const rowTop = selectedIndex * ROW_HEIGHT;

    if (!positioned.current) {
      // First show (site opened, or navigated here from output): centre it.
      element.scrollTop = rowTop - (viewportHeight - ROW_HEIGHT) / 2;
      positioned.current = true;
    } else if (rowTop < element.scrollTop) {
      element.scrollTop = rowTop;
    } else if (rowTop + ROW_HEIGHT > element.scrollTop + viewportHeight) {
      element.scrollTop = rowTop + ROW_HEIGHT - viewportHeight;
    }

    setScrollTop(element.scrollTop);
  }, [selectedIndex, viewportHeight]);

  function chooseNeighbour(event: KeyboardEvent<HTMLDivElement>): void {
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;

    const neighbour = blocks[selectedIndex + step];

    if (step === 0 || neighbour === undefined) return;
    event.preventDefault();
    onChoose(neighbour);
  }

  const first = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN_ROWS);

  const end = Math.min(
    blocks.length,
    Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + OVERSCAN_ROWS,
  );

  return (
    <WindowChrome
      className=""
      style={{ width: SIBLING_LIST_WIDTH }}
      title={siblingListTitle(trace, blocks)}
    >
      <div
        className="overflow-y-auto overscroll-contain"
        data-sibling-list
        onKeyDown={chooseNeighbour}
        onScroll={(event) => {
          setScrollTop(event.currentTarget.scrollTop);
        }}
        ref={scrollRef}
        style={{ height: viewportHeight }}
      >
        <div
          className="relative"
          style={{ height: blocks.length * ROW_HEIGHT }}
        >
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
                  "absolute inset-x-0 flex cursor-pointer items-center gap-1.5 border-0 bg-transparent px-2 text-left text-xs font-medium text-neutral-500 outline-none",
                  selected
                    ? "bg-site-accent/12 text-neutral-800"
                    : "hover:bg-neutral-50 focus-visible:bg-neutral-50",
                )}
                data-block={block}
                key={block}
                onClick={() => {
                  onChoose(block);
                }}
                style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }}
                type="button"
              >
                <span className="truncate">{title.text}</span>
                {titleIndicator(title.hasException, title.hasOutput)}
              </button>
            );
          })}
        </div>
      </div>
    </WindowChrome>
  );
}
