import { cn } from "@/ui/utils.ts";

import { InlineChip } from "./inline-chip.tsx";
import { preview, valueChildren } from "./values.ts";

import type { LineValue } from "./block-view.ts";
import type { Trace } from "@codewalk/trace";

const CHIP_BUDGET = 40;

interface ValueChipProps {
  trace: Trace;
  label: string;
  entry: LineValue;
  expanded: boolean;
  faded?: boolean;
  className?: string;
  onToggle: () => void;
}

export function ValueChip({
  trace,
  label,
  entry,
  expanded,
  faded = false,
  className,
  onToggle,
}: ValueChipProps) {
  const expandable = valueChildren(trace, entry.value, entry.at) !== null;

  return (
    <InlineChip
      className={cn(className, faded && "opacity-40")}
      expandable={expandable}
      expanded={expanded}
      onToggle={onToggle}
      tone="value"
    >
      {label} {preview(trace, entry.value, entry.at, CHIP_BUDGET)}
    </InlineChip>
  );
}
