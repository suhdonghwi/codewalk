import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/ui/utils.ts";

import { preview, sharedObjects, valueChildren } from "./values.ts";

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

  return <span className="text-neutral-400">#{value.ref}</span>;
}

function Disclosure({ expanded }: { expanded: boolean }) {
  return (
    <ChevronRight
      aria-hidden
      className={cn(
        "inline-block size-[1em] flex-none self-center transition-transform",
        expanded && "rotate-90",
      )}
      strokeWidth={2.25}
    />
  );
}

function ValueRow({ trace, row, at, depth, shared }: RowProps) {
  const [expanded, setExpanded] = useState(false);
  const expandable = valueChildren(trace, row.value, at) !== null;
  const keyWidth = row.key === null ? 0 : row.key.length + 1;
  const budget = ROW_WIDTH - depth * 2 - keyWidth - 2;

  const content = (
    <>
      {expandable ? (
        <Disclosure expanded={expanded} />
      ) : (
        <span className="w-[1em] flex-none" />
      )}
      {row.key === null ? null : (
        <span className="flex-none text-neutral-500">{row.key}</span>
      )}
      <span className="whitespace-pre text-inline-value">
        {preview(trace, row.value, at, budget)}
      </span>
      <Badge shared={shared} value={row.value} />
    </>
  );

  const rowClasses = "flex items-baseline gap-[1ch] text-left";
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
          style={{ paddingLeft: `calc(${depth * 2}ch + 2em)` }}
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
    <div className="col-span-full mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] rounded-sm bg-inline-value-surface/60 px-[1ch] py-0.5 whitespace-nowrap">
      <div className="flex items-baseline gap-[1ch] text-neutral-500">
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
