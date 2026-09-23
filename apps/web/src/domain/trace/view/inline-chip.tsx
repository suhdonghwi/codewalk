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

export function Disclosure({ expanded }: { expanded: boolean }) {
  return (
    <svg
      aria-hidden
      className={cn(
        "mr-[0.25ch] inline-block size-[1em] align-[-0.12em] transition-transform",
        expanded && "rotate-90",
      )}
      viewBox="0 0 12 12"
    >
      <path d="M4.25 3.5 8.5 6 4.25 8.5Z" fill="currentColor" />
    </svg>
  );
}

export function InlineChip({
  tone,
  children,
  className,
  expandable = false,
  expanded = false,
  onToggle,
}: InlineChipProps) {
  const classes = cn(
    "inline-block flex-none rounded-sm px-[0.5ch] [font:inherit] leading-[18px]!",
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
      <Disclosure expanded={expanded} />
      {children}
    </button>
  );
}
