import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/ui/utils.ts";

import { previewInlineOutput } from "./inline-output.ts";

import type { Line } from "./block-view.ts";
import type { Span } from "./spans.ts";
import type { LocId } from "@codewalk/trace";

interface TraceLineProps {
  line: Line;
  anchor: boolean;
  hoveredSite: LocId | null;
  openSite: LocId | null;
  onHoverSite: (site: LocId | null) => void;
  onToggleSite: (site: LocId) => void;
}

const STATE_CLASSES: Record<Span["state"], string> = {
  lit: "",
  dimmed: "!text-neutral-500 !not-italic opacity-55",
  inert: "opacity-55",
};

const CHIP_CLASSES = "ml-[2ch] rounded-sm px-[0.75ch]";

const OUTPUT_CHIP_CLASSES = cn(
  CHIP_CLASSES,
  "bg-inline-output-surface text-inline-output",
);

const EXCEPTION_CHIP_CLASSES = cn(
  CHIP_CLASSES,
  "bg-exception/15 text-exception",
);

function siteBackground(span: Span): string | undefined {
  if (span.state !== "lit" || span.sites.length === 0) return undefined;
  const strength = Math.min(14, 8 + (span.sites.length - 1) * 2);

  return `color-mix(in srgb, var(--color-site-accent) ${strength}%, transparent)`;
}

export function TraceLine({
  line,
  anchor,
  hoveredSite,
  openSite,
  onHoverSite,
  onToggleSite,
}: TraceLineProps) {
  const [expanded, setExpanded] = useState(false);

  const preview =
    line.output === null ? null : previewInlineOutput(line.output);

  return (
    <div className="min-w-max">
      <div
        className={cn(
          "flex min-h-code-line w-max min-w-full items-baseline pr-4 whitespace-pre",
          line.exception !== null && "bg-exception/8",
        )}
        data-site-anchor={anchor || undefined}
      >
        <span
          aria-hidden
          className={cn(
            "w-gutter flex-none pr-2 pl-1.5 text-right select-none",
            line.exception === null ? "text-line-number" : "text-exception",
          )}
        >
          {line.number}
        </span>
        <code className="inline-block min-w-px pl-2.5 text-code-foreground [font:inherit]">
          {line.spans.map((span, index) => {
            const innermost = span.sites.at(-1);

            const isHovered =
              hoveredSite !== null && span.sites.includes(hoveredSite);

            const isOpen = openSite !== null && span.sites.includes(openSite);

            const interactive = innermost !== undefined && span.state === "lit";

            const className = cn(
              "min-h-code-line",
              STATE_CLASSES[span.state],
              span.classes,
              interactive && "cursor-pointer",
              isHovered && !isOpen && "!bg-site-accent/16",
              isOpen &&
                "!bg-site-accent/24 shadow-[inset_0_-1px_var(--color-site-accent)]",
            );

            return (
              <span
                className={className}
                data-trace-site={interactive || undefined}
                key={index}
                onClick={
                  interactive
                    ? () => {
                        onToggleSite(innermost);
                      }
                    : undefined
                }
                onPointerEnter={
                  interactive
                    ? () => {
                        onHoverSite(innermost);
                      }
                    : undefined
                }
                onPointerLeave={
                  interactive
                    ? () => {
                        onHoverSite(null);
                      }
                    : undefined
                }
                style={{ backgroundColor: siteBackground(span) }}
              >
                {span.text}
              </span>
            );
          })}
        </code>
        {preview === null ? null : preview.expandable ? (
          <button
            className={cn(
              OUTPUT_CHIP_CLASSES,
              "cursor-pointer border-0 py-0 pl-[0.25ch] [font:inherit] hover:brightness-95",
            )}
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((current) => !current);
            }}
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
            {preview.segments.map((segment, index) => (
              <span
                className={
                  segment.stream === "stderr" ? "text-code-error" : undefined
                }
                key={index}
              >
                {segment.text}
              </span>
            ))}
          </button>
        ) : (
          <span className={OUTPUT_CHIP_CLASSES}>
            {preview.segments.map((segment, index) => (
              <span
                className={
                  segment.stream === "stderr" ? "text-code-error" : undefined
                }
                key={index}
              >
                {segment.text}
              </span>
            ))}
          </span>
        )}
        {line.exception === null ? null : (
          <span className={EXCEPTION_CHIP_CLASSES}>{line.exception}</span>
        )}
      </div>
      {expanded && line.output !== null ? (
        <pre className="m-0 mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] rounded-sm bg-inline-output-surface/60 px-[1ch] py-0.5 text-inline-output whitespace-pre-wrap [font:inherit]">
          {line.output.segments.map((segment, index) => (
            <span
              className={
                segment.stream === "stderr" ? "text-code-error" : undefined
              }
              key={index}
            >
              {segment.text}
            </span>
          ))}
        </pre>
      ) : null}
    </div>
  );
}
