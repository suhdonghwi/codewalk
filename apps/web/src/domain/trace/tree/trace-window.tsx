import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";

import { buildBlockView } from "../view/block-view.ts";
import { tokenizePython } from "../view/tokens.ts";
import { TraceLine } from "../view/trace-line.tsx";

import type { LocId, Trace, TraceNode } from "@codewalk/trace";

const MAX_VISIBLE_LINES = 30;

interface TraceWindowProps {
  trace: Trace;
  block: TraceNode;
  title: string;
  varyingNames: string[];
  openSite: LocId | null;
  titlebarProps: HTMLAttributes<HTMLDivElement> | undefined;
  onToggleSite: (site: LocId) => void;
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
  block: TraceNode;
  openSite: LocId | null;
  varyingNames: string[];
  onToggleSite: (site: LocId) => void;
}

function WindowBody({
  trace,
  block,
  openSite,
  varyingNames,
  onToggleSite,
}: WindowBodyProps) {
  const [hoveredSite, setHoveredSite] = useState<LocId | null>(null);
  const source = trace.source.text;
  const tokens = useMemo(() => tokenizePython(source), [source]);

  const view = useMemo(
    () => buildBlockView(trace, block, tokens),
    [trace, block, tokens],
  );

  const anchorLine =
    openSite === null
      ? null
      : (view.groups
          .flat()
          .find((line) =>
            line.spans.some((span) => span.sites.includes(openSite)),
          )?.number ?? null);

  return (
    <div
      className="code-surface min-h-0 max-w-trace overflow-auto"
      style={{
        maxHeight: `calc(${MAX_VISIBLE_LINES} * var(--spacing-code-line) + 1rem)`,
      }}
    >
      <div className="grid w-max min-w-full grid-cols-[minmax(max-content,1fr)] py-2">
        <div
          aria-hidden
          className="sticky left-0 z-1 col-start-1 row-start-1 -my-2 box-content w-gutter border-r border-gutter-divider bg-white"
          style={{ gridRowEnd: `span ${view.groups.length}` }}
        />
        {view.groups.map((group, index) => (
          <div
            className="col-start-1 grid grid-cols-[max-content_minmax(max-content,1fr)]"
            key={group[0]?.number}
            style={{ gridRowStart: index + 1 }}
          >
            {group.map((line) => (
              <TraceLine
                anchor={line.number === anchorLine}
                hoveredSite={hoveredSite}
                key={line.number}
                line={line}
                trace={trace}
                varyingNames={varyingNames}
                onHoverSite={setHoveredSite}
                onToggleSite={onToggleSite}
                openSite={openSite}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function TraceWindow({
  trace,
  block,
  title,
  varyingNames,
  openSite,
  titlebarProps,
  onToggleSite,
}: TraceWindowProps) {
  return (
    <WindowChrome
      className="flex w-max max-w-trace flex-col"
      title={title}
      titleIndicator={titleIndicator(block.exc !== null)}
      titlebarProps={titlebarProps}
    >
      <WindowBody
        block={block}
        onToggleSite={onToggleSite}
        openSite={openSite}
        trace={trace}
        varyingNames={varyingNames}
      />
    </WindowChrome>
  );
}
