import type { HTMLAttributes } from "react";
import { useMemo, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";

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

const MAX_VISIBLE_LINES = 30;

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  position: SiblingPosition;
  columns: SiblingColumn[];
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
  block: NodeId;
  openSite: LocId | null;
  columns: SiblingColumn[];
  onToggleSite: (site: LocId) => void;
}

function WindowBody({
  trace,
  block,
  openSite,
  columns,
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
                varyingNames={columns.map(({ name }) => name)}
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
  position,
  columns,
  openSite,
  titlebarProps,
  onToggleSite,
}: TraceWindowProps) {
  const title = buildBlockTitle(trace, block, position);

  return (
    <WindowChrome
      className="flex w-max max-w-trace flex-col"
      title={title.text}
      titleIndicator={titleIndicator(title.hasException)}
      titlebarProps={titlebarProps}
    >
      <WindowBody
        block={block}
        columns={columns}
        onToggleSite={onToggleSite}
        openSite={openSite}
        trace={trace}
      />
    </WindowChrome>
  );
}
