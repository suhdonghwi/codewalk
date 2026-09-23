import { InlineChip } from "./inline-chip.tsx";
import { PreviewText } from "./preview-text.tsx";
import { PREVIEW_BUDGET, previewPieces, valueChildren } from "./values.ts";

import type { RecordedValue, Trace } from "@codewalk/trace";

interface ValueChipProps {
  trace: Trace;
  label?: string | undefined;
  entry: RecordedValue;
  expanded: boolean;
  className?: string;
  onToggle: () => void;
}

export function ValueChip({
  trace,
  label,
  entry,
  expanded,
  className,
  onToggle,
}: ValueChipProps) {
  const expandable = valueChildren(trace, entry.value, entry.at) !== null;

  return (
    <InlineChip
      className={className}
      expandable={expandable}
      expanded={expanded}
      onToggle={onToggle}
      tone="value"
    >
      {label === undefined ? null : `${label} `}
      <PreviewText
        pieces={previewPieces(trace, entry.value, entry.at, PREVIEW_BUDGET)}
      />
    </InlineChip>
  );
}
