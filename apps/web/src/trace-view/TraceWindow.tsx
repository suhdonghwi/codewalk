import type { HTMLAttributes, Ref } from "react";
import { useEffect, useMemo, useState } from "react";

import { WindowChrome } from "@/canvas/Window.tsx";

import { buildBlockTitle, buildBlockView } from "./block-view.ts";
import { mountCodeHighlightStyle, tokenizePython } from "./tokens.ts";
import { TraceLine } from "./TraceLine.tsx";

import type { LocId, NodeId, Trace } from "@codewalk/trace";
import type { Focus } from "@/trace-tree/navigation.ts";

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  expanded: boolean;
  focus?: Focus | null;
  openSite?: LocId | null;
  onToggleSite?: (site: LocId) => void;
  chromeRef?: Ref<HTMLElement> | undefined;
  titlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
  className?: string | undefined;
}

function blockSource(trace: Trace, block: NodeId): string {
  const node = trace.nodes[block];
  const loc = node === undefined ? undefined : trace.header.locs[node.loc];
  const source = loc === undefined ? undefined : trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  return source.text;
}

function titleIndicator(hasException: boolean, hasOutput: boolean) {
  const marker = hasException
    ? "trace-title-dot trace-title-exception"
    : hasOutput
      ? "trace-title-dot trace-title-output"
      : null;

  return marker === null ? null : <span aria-hidden className={marker} />;
}

interface ExpandedBodyProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  focus: Focus | null;
  onToggleSite: (site: LocId) => void;
}

function ExpandedBody({
  trace,
  block,
  openSite,
  focus,
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
    <div className="trace-body">
      <div className="trace-code">
        {view.lines.map((line) => (
          <TraceLine
            anchor={line.number === anchorLine}
            focusKind={line.number === focus?.line ? focus.kind : null}
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
  focus = null,
  openSite = null,
  onToggleSite = () => undefined,
  chromeRef,
  titlebarProps,
  className = "",
}: TraceWindowProps) {
  const title = useMemo(() => buildBlockTitle(trace, block), [trace, block]);

  return (
    <WindowChrome
      chromeRef={chromeRef}
      className={`trace-window ${className}`}
      title={title.text}
      titleIndicator={titleIndicator(title.hasException, title.hasOutput)}
      titlebarProps={titlebarProps}
    >
      {expanded ? (
        <ExpandedBody
          block={block}
          focus={focus}
          onToggleSite={onToggleSite}
          openSite={openSite}
          trace={trace}
        />
      ) : null}
    </WindowChrome>
  );
}
