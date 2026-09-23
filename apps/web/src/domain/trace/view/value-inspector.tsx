import { useState } from "react";

import { cn } from "@/ui/utils.ts";

import { Disclosure } from "./inline-chip.tsx";
import { PreviewText } from "./preview-text.tsx";
import {
  pieceText,
  previewPieces,
  sharedObjects,
  valueChildren,
} from "./values.ts";

import type { ValueRow as Row } from "./values.ts";
import type { ObjectId, Trace, Value } from "@codewalk/trace";

const ROW_WIDTH = 72;

interface ValueInspectorProps {
  trace: Trace;
  name: string;
  value: Value;
  at: number;
}

interface RowsProps {
  trace: Trace;
  value: Value;
  at: number;
  depth: number;
  shared: Set<ObjectId>;
}

interface RowProps {
  trace: Trace;
  row: Row;
  at: number;
  depth: number;
  shared: Set<ObjectId>;
}

function Badge({ value, shared }: { value: Value; shared: Set<ObjectId> }) {
  if (!("ref" in value) || !shared.has(value.ref)) return null;

  return <span className="ml-[1ch] text-neutral-400">#{value.ref}</span>;
}

function ValueRow({ trace, row, at, depth, shared }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = valueChildren(trace, row.value, at) !== null;
  const keyWidth = row.key === null ? 0 : pieceText(row.key).length + 2;
  const budget = ROW_WIDTH - depth * 2 - keyWidth - 2;

  const content = (
    <>
      {expandable ? (
        <Disclosure expanded={expanded} />
      ) : (
        <span className="mr-[0.25ch] inline-block w-[1em]" />
      )}
      {row.key === null ? null : (
        <span className="mr-[1ch] text-neutral-500">
          <PreviewText pieces={row.key} />:
        </span>
      )}
      <span className="text-syntax-name">
        <PreviewText pieces={previewPieces(trace, row.value, at, budget)} />
      </span>
      <Badge shared={shared} value={row.value} />
    </>
  );

  const rowClasses = "block text-left whitespace-pre text-neutral-400";
  const indent = { paddingLeft: `${depth * 2}ch` };

  return (
    <>
      {expandable ? (
        <button
          aria-expanded={expanded}
          className={cn(
            rowClasses,
            "w-full cursor-pointer border-0 bg-transparent p-0 [font:inherit] hover:bg-inline-value-surface",
          )}
          onClick={() => {
            setExpanded((current) => !current);
          }}
          style={indent}
          type="button"
        >
          {content}
        </button>
      ) : (
        <div className={rowClasses} style={indent}>
          {content}
        </div>
      )}
      {expanded ? (
        <ValueRows
          at={at}
          depth={depth + 1}
          shared={shared}
          trace={trace}
          value={row.value}
        />
      ) : null}
    </>
  );
}

function ValueRows({ trace, value, at, depth, shared }: RowsProps) {
  const children = valueChildren(trace, value, at);

  if (children === null) return null;

  return (
    <>
      {children.rows.map((row, index) => (
        <ValueRow
          at={at}
          depth={depth}
          key={index}
          row={row}
          shared={shared}
          trace={trace}
        />
      ))}
      {children.more > 0 ? (
        <div
          className="text-neutral-400"
          style={{ paddingLeft: `calc(${depth * 2}ch + 1em + 0.25ch)` }}
        >
          … {children.more} more
        </div>
      ) : null}
    </>
  );
}

export function ValueInspector({
  trace,
  name,
  value,
  at,
}: ValueInspectorProps) {
  const shared = sharedObjects(trace, value, at);

  return (
    <div className="max-h-[calc(12*var(--spacing-code-line)+0.25rem)] overflow-auto overscroll-contain rounded-sm bg-inline-value-surface/60 px-[1ch] py-0.5 whitespace-nowrap">
      <div className="text-neutral-500">
        {name}
        <Badge shared={shared} value={value} />
      </div>
      <ValueRows
        at={at}
        depth={0}
        shared={shared}
        trace={trace}
        value={value}
      />
    </div>
  );
}
