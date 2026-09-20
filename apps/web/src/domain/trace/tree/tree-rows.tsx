import type { HTMLAttributes } from "react";

import { WindowChrome } from "@/domain/canvas/index.ts";

import {
  TITLE_BAR,
  visualExpandedIndex,
  type ColumnLayout,
  type StackRow,
} from "./layout.ts";
import {
  MeasuredTraceWindow,
  type Measurement,
} from "./measured-trace-window.tsx";

import type { Focus } from "./navigation.ts";
import type { PathColumn } from "./path.ts";
import { TraceWindow } from "../view/trace-window.tsx";
import type { LocId, NodeId, Trace } from "@codewalk/trace";

const STACK_STEP = TITLE_BAR + 4;

function rowTop(
  rowIndex: number,
  expandedRow: number,
  layout: ColumnLayout,
  expandedHeight: number,
): number {
  if (rowIndex <= expandedRow) return layout.stackTop + rowIndex * STACK_STEP;

  return (
    layout.expandedTop +
    expandedHeight +
    4 +
    (rowIndex - expandedRow - 1) * STACK_STEP
  );
}

interface TreeBlockRowProps {
  trace: Trace;
  block: NodeId | undefined;
  expandedBlock: NodeId;
  focus: Focus | null;
  openSite: LocId | null;
  column: number;
  top: number;
  visible: boolean;
  layout: ColumnLayout | undefined;
  measurement: Measurement | null;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (column: number, site: LocId) => void;
  onChoose: (column: number, block: NodeId) => void;
  rootTitlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

function TreeBlockRow({
  trace,
  block,
  expandedBlock,
  focus,
  openSite,
  column,
  top,
  visible,
  layout,
  measurement,
  onMeasure,
  onToggleSite,
  onChoose,
  rootTitlebarProps,
}: TreeBlockRowProps) {
  if (block === undefined) return null;
  const expanded = block === expandedBlock;

  return (
    <div
      className="absolute z-1 animate-tree-fade-in"
      data-block={block}
      data-expanded={expanded}
      style={{
        left: layout?.x ?? 0,
        top,
        visibility: visible ? "visible" : "hidden",
        width: expanded ? undefined : (measurement?.width ?? undefined),
      }}
    >
      {expanded ? (
        <MeasuredTraceWindow
          block={block}
          className=""
          column={column}
          focus={focus?.block === block ? focus : null}
          onMeasure={onMeasure}
          onToggleSite={(site) => onToggleSite(column, site)}
          openSite={openSite}
          titlebarProps={column === 0 ? rootTitlebarProps : undefined}
          titlebarClassName={
            column === 0 ? "cursor-grab active:cursor-grabbing" : undefined
          }
          trace={trace}
        />
      ) : (
        <TraceWindow
          block={block}
          className="w-full"
          expanded={false}
          titlebarClassName="cursor-pointer hover:bg-neutral-50"
          titlebarProps={{ onClick: () => onChoose(column, block) }}
          trace={trace}
        />
      )}
    </div>
  );
}

function OmittedTreeRow({
  top,
  visible,
  layout,
  measurement,
}: {
  top: number;
  visible: boolean;
  layout: ColumnLayout | undefined;
  measurement: Measurement | null;
}) {
  return (
    <div
      className="absolute z-1 animate-tree-fade-in"
      style={{
        left: layout?.x ?? 0,
        top,
        visibility: visible ? "visible" : "hidden",
        width: measurement?.width,
      }}
    >
      <WindowChrome
        className="w-full max-w-trace"
        title="⋯"
        titlebarClassName="justify-center p-0 text-neutral-400"
      />
    </div>
  );
}

interface TreeRowsProps {
  trace: Trace;
  column: PathColumn;
  columnIndex: number;
  rows: StackRow[];
  expandedBlock: NodeId;
  focus: Focus | null;
  layout: ColumnLayout | undefined;
  measurement: Measurement | null;
  onMeasure: (column: number, measurement: Measurement) => void;
  onToggleSite: (column: number, site: LocId) => void;
  onChoose: (column: number, block: NodeId) => void;
  rootTitlebarProps?: HTMLAttributes<HTMLDivElement> | undefined;
}

export function TreeRows({
  trace,
  column,
  columnIndex,
  rows,
  expandedBlock,
  focus,
  layout,
  measurement,
  onMeasure,
  onToggleSite,
  onChoose,
  rootTitlebarProps,
}: TreeRowsProps) {
  const expandedRow = visualExpandedIndex(rows, column.expandedIndex);
  const visible = measurement !== null && layout !== undefined;

  return rows.map((row, rowIndex) => {
    const top =
      visible && measurement !== null && layout !== undefined
        ? rowTop(rowIndex, expandedRow, layout, measurement.height)
        : 0;

    if (row.kind === "omitted") {
      return (
        <OmittedTreeRow
          key={`${columnIndex}:omitted:${row.side}`}
          layout={layout}
          measurement={measurement}
          top={top}
          visible={visible}
        />
      );
    }

    const block = column.blocks[row.index];

    return (
      <TreeBlockRow
        block={block}
        column={columnIndex}
        expandedBlock={expandedBlock}
        focus={focus}
        key={`${columnIndex}:block:${block}`}
        layout={layout}
        measurement={measurement}
        onChoose={onChoose}
        onMeasure={onMeasure}
        onToggleSite={onToggleSite}
        openSite={column.openSite}
        rootTitlebarProps={rootTitlebarProps}
        top={top}
        trace={trace}
        visible={visible}
      />
    );
  });
}
