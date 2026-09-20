import type { HTMLAttributes, Ref } from "react";
import { useEffect, useMemo, useState } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";
import { cn } from "@/ui/utils.ts";

import { buildBlockTitle, buildBlockView } from "./block-view.ts";
import { mountCodeHighlightStyle, tokenizePython } from "./tokens.ts";
import { TraceLine } from "./trace-line.tsx";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  expanded: boolean;
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

export function titleIndicator(hasException: boolean, hasOutput: boolean) {
  const color = hasException
    ? "bg-exception"
    : hasOutput
      ? "bg-neutral-400"
      : null;

  return color === null ? null : (
    <span
      aria-hidden
      className={cn("size-1.5 flex-none rounded-full", color)}
    />
  );
}

interface ExpandedBodyProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  onToggleSite: (site: LocId) => void;
}

function ExpandedBody({
  trace,
  block,
  openSite,
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
    <div className="code-surface max-w-trace overflow-x-auto">
      <div className="relative w-max min-w-full py-2">
        <div
          aria-hidden
          className="absolute inset-y-0 left-gutter w-px bg-gutter-divider"
        />
        {view.lines.map((line) => (
          <TraceLine
            anchor={line.number === anchorLine}
            hoveredSite={hoveredSite}
            key={line.number}
            line={line}
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
  expanded,
  openSite = null,
  onToggleSite = () => undefined,
  chromeRef,
  titlebarProps,
  titlebarClassName,
  className = "",
}: TraceWindowProps) {
  const title = useMemo(() => buildBlockTitle(trace, block), [trace, block]);

  return (
    <WindowChrome
      chromeRef={chromeRef}
      className={cn("w-max max-w-trace", className)}
      title={title.text}
      titleIndicator={titleIndicator(title.hasException, title.hasOutput)}
      titlebarClassName={titlebarClassName}
      titlebarProps={titlebarProps}
    >
      {expanded ? (
        <ExpandedBody
          block={block}
          onToggleSite={onToggleSite}
          openSite={openSite}
          trace={trace}
        />
      ) : null}
    </WindowChrome>
  );
}
