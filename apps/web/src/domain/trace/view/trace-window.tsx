import type { HTMLAttributes, ReactNode, Ref } from "react";
import { useEffect, useMemo, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import { buildBlockTitle, type SiblingPosition } from "./block-title.ts";
import { buildBlockView } from "./block-view.ts";
import { mountCodeHighlightStyle, tokenizePython } from "./tokens.ts";
import { TraceLine } from "./trace-line.tsx";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  position: SiblingPosition;
  expanded: boolean;
  width?: number | null;
  height?: number | null;
  resizeHandles?: ReactNode;
  openSite?: LocId | null;
  onToggleSite?: (site: LocId) => void;
  chromeRef?: Ref<HTMLElement> | undefined;
  titlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
  titlebarClassName?: string | undefined;
  className?: string | undefined;
}

function blockSource(trace: Trace, block: NodeId): string {
  const node = trace.nodes[block];
  const loc = node === undefined ? undefined : trace.header.locs[node.loc];
  const source = loc === undefined ? undefined : trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  return source.text;
}

export function titleIndicator(hasException: boolean) {
  return hasException ? (
    <span
      aria-hidden
      className="size-1.5 flex-none rounded-full bg-exception"
    />
  ) : null;
}

interface ExpandedBodyProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  fitsContent: boolean;
  onToggleSite: (site: LocId) => void;
}

function ExpandedBody({
  trace,
  block,
  openSite,
  fitsContent,
  onToggleSite,
}: ExpandedBodyProps) {
  const [hoveredSite, setHoveredSite] = useState<LocId | null>(null);
  const source = blockSource(trace, block);
  const tokens = useMemo(() => tokenizePython(source), [source]);

  const view = useMemo(
    () => buildBlockView(trace, block, tokens),
    [trace, block, tokens],
  );

  useEffect(() => {
    mountCodeHighlightStyle(document);
  }, []);

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
      <div className="grid w-max min-w-full py-2">
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
  expanded,
  width = null,
  height = null,
  resizeHandles,
  openSite = null,
  onToggleSite = () => undefined,
  chromeRef,
  titlebarProps,
  titlebarClassName,
  className = "",
}: TraceWindowProps) {
  const title = buildBlockTitle(trace, block, position);

  return (
    <WindowChrome
      chromeRef={chromeRef}
      className={cn(
        "flex max-h-max flex-col",
        width === null && "w-max max-w-trace",
        className,
      )}
      style={{ width: width ?? undefined, height: height ?? undefined }}
      title={title.text}
      titleIndicator={titleIndicator(title.hasException)}
      titlebarClassName={titlebarClassName}
      titlebarProps={titlebarProps}
    >
      {expanded ? (
        <ExpandedBody
          block={block}
          fitsContent={width === null}
          onToggleSite={onToggleSite}
          openSite={openSite}
          trace={trace}
        />
      ) : null}
      {resizeHandles}
    </WindowChrome>
  );
}
