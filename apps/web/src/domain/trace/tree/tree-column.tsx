import type { HTMLAttributes } from "react";

import {
  MeasuredTraceWindow,
  type Measurement,
} from "./measured-trace-window.tsx";
import { SiblingList } from "./sibling-list.tsx";

import type { ColumnLayout } from "./layout.ts";
import type { Focus } from "./navigation.ts";
import type { PathColumn } from "./path.ts";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

interface TreeColumnProps {
  trace: Trace;
  column: PathColumn;
  columnIndex: number;
  expandedBlock: NodeId;
  focus: Focus | null;
  layout: ColumnLayout | undefined;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (column: number, site: LocId) => void;
  onChoose: (column: number, block: NodeId) => void;
  rootTitlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

export function TreeColumn({
  trace,
  column,
  columnIndex,
  expandedBlock,
  focus,
  layout,
  onMeasure,
  onToggleSite,
  onChoose,
  rootTitlebarProps,
}: TreeColumnProps) {
  const visibility = layout === undefined ? "hidden" : "visible";

  return (
    <>
      {column.blocks.length > 1 ? (
        <div
          className="absolute z-1 animate-tree-fade-in"
          key={`siblings:${column.blocks[0]}`}
          style={{ left: layout?.x ?? 0, top: layout?.top ?? 0, visibility }}
        >
          <SiblingList
            blocks={column.blocks}
            onChoose={(block) => onChoose(columnIndex, block)}
            selectedIndex={column.expandedIndex}
            trace={trace}
          />
        </div>
      ) : null}
      <div
        className="absolute z-1 animate-tree-fade-in"
        data-block={expandedBlock}
        key={expandedBlock}
        style={{
          left: layout?.windowX ?? 0,
          top: layout?.top ?? 0,
          visibility,
        }}
      >
        <MeasuredTraceWindow
          block={expandedBlock}
          className=""
          column={columnIndex}
          focus={focus?.block === expandedBlock ? focus : null}
          onMeasure={onMeasure}
          onToggleSite={(site) => onToggleSite(columnIndex, site)}
          openSite={column.openSite}
          titlebarClassName={
            columnIndex === 0 ? "cursor-grab active:cursor-grabbing" : undefined
          }
          titlebarProps={columnIndex === 0 ? rootTitlebarProps : undefined}
          trace={trace}
        />
      </div>
    </>
  );
}
