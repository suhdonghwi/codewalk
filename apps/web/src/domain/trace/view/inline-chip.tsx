import { ChevronRight } from "lucide-react";

import { cn } from "@/ui/utils.ts";

import type { ReactNode } from "react";

type InlineChipTone = "value" | "output" | "exception";

interface InlineChipProps {
  tone: InlineChipTone;
  children: ReactNode;
  className?: string | undefined;
  expandable?: boolean;
  expanded?: boolean;
  onToggle?: (() => void) | undefined;
}

const TONE_CLASSES: Record<InlineChipTone, string> = {
  value: "bg-inline-value-surface text-inline-value",
  output: "bg-inline-output-surface text-inline-output",
  exception: "bg-exception/15 text-exception",
};

export function InlineChip({
  tone,
  children,
  className,
  expandable = false,
  expanded = false,
  onToggle,
}: InlineChipProps) {
  const classes = cn(
    "inline-block flex-none rounded-sm px-[0.5ch] [font:inherit] leading-4!",
    TONE_CLASSES[tone],
    expandable &&
      "cursor-pointer border-0 py-0 pl-[0.15ch] hover:brightness-95",
    className,
  );

  if (!expandable) return <span className={classes}>{children}</span>;

  return (
    <button
      aria-expanded={expanded}
      className={classes}
      onClick={onToggle}
      type="button"
    >
      <ChevronRight
        aria-hidden
        className={cn(
          "mr-[0.25ch] inline-block size-[1em] align-[-0.125em] transition-transform",
          expanded && "rotate-90",
        )}
        strokeWidth={2.25}
      />
      {children}
    </button>
  );
}
