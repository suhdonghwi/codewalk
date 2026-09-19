import { useEffect, useMemo, useState } from "react";

import { CanvasWindow } from "@/canvas/Window.tsx";

import { buildBlockView } from "./block-view.ts";
import { mountCodeHighlightStyle, tokenizePython } from "./tokens.ts";
import { TraceLine } from "./TraceLine.tsx";

import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface TraceWindowProps {
  trace: Trace;
  block: NodeId;
  openSite: LocId | null;
  onToggleSite: (site: LocId) => void;
}

function blockSource(trace: Trace, block: NodeId): string {
  const node = trace.nodes[block];
  const loc = node === undefined ? undefined : trace.header.locs[node.loc];
  const source = loc === undefined ? undefined : trace.header.sources[loc.file];

  if (source === undefined) throw new Error(`Block ${block} has no source`);

  return source.text;
}

function TraceWindow({
  trace,
  block,
  openSite,
  onToggleSite,
}: TraceWindowProps) {
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

  const marker = view.title.hasException
    ? "trace-title-dot trace-title-exception"
    : view.title.hasOutput
      ? "trace-title-dot trace-title-output"
      : null;

  return (
    <CanvasWindow
      className="trace-window"
      id="trace"
      title={view.title.text}
      titleIndicator={
        marker === null ? null : <span aria-hidden className={marker} />
      }
    >
      <div className="trace-body">
        <div className="trace-code">
          {view.lines.map((line) => (
            <TraceLine
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
    </CanvasWindow>
  );
}

interface RootTraceWindowProps {
  trace: Trace;
  block: NodeId;
}

export function RootTraceWindow({ trace, block }: RootTraceWindowProps) {
  const [openSite, setOpenSite] = useState<LocId | null>(null);

  useEffect(() => {
    setOpenSite(null);
  }, [trace, block]);

  function toggleSite(site: LocId): void {
    setOpenSite((current) => (current === site ? null : site));
  }

  return (
    <TraceWindow
      block={block}
      onToggleSite={toggleSite}
      openSite={openSite}
      trace={trace}
    />
  );
}
