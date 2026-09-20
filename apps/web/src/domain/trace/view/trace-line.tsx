import { useState } from "react";

import { cn } from "@/ui/utils.ts";

import { previewInlineOutput } from "./inline-output.ts";

import type { Line, Span } from "./block-view.ts";
import type { Focus } from "../tree/navigation.ts";
import type { LocId } from "@codewalk/trace";

interface TraceLineProps {
  line: Line;
  anchor: boolean;
  focusKind: Focus["kind"] | null;
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

const OUTPUT_CHIP_CLASSES =
  "ml-[2ch] rounded-sm bg-inline-output-surface px-[0.75ch] text-inline-output";

const FOCUS_LINE_CLASSES: Record<Focus["kind"], string> = {
  output: "bg-site-accent/8",
  exception: "bg-exception/8",
};

const FOCUS_GUTTER_CLASSES: Record<Focus["kind"], string> = {
  output: "after:bg-site-accent",
  exception: "after:bg-exception",
};

function siteBackground(span: Span): string | undefined {
  if (span.state !== "lit" || span.sites.length === 0) return undefined;
  const strength = Math.min(14, 8 + (span.sites.length - 1) * 2);

  return `color-mix(in srgb, var(--color-site-accent) ${strength}%, transparent)`;
}

export function TraceLine({
  line,
  anchor,
  focusKind,
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
          "flex min-h-[1.5em] w-max min-w-full items-baseline pr-4 whitespace-pre",
          focusKind !== null && FOCUS_LINE_CLASSES[focusKind],
        )}
        data-focus-kind={focusKind ?? undefined}
        data-focused-line={focusKind ?? undefined}
        data-site-anchor={anchor || undefined}
      >
        <span
          aria-hidden
          className={cn(
            "relative w-gutter flex-none pr-2 pl-1.5 text-right text-neutral-400 select-none",
            focusKind !== null &&
              "after:absolute after:inset-y-0 after:left-0 after:w-0.5",
            focusKind !== null && FOCUS_GUTTER_CLASSES[focusKind],
            line.exception !== null &&
              "before:absolute before:top-[0.58em] before:left-1 before:size-1 before:rounded-full before:bg-exception",
          )}
        >
          {line.number}
        </span>
        <code className="inline-block min-w-px text-code-foreground [font:inherit]">
          {line.spans.map((span, index) => {
            const innermost = span.sites.at(-1);

            const isHovered =
              hoveredSite !== null && span.sites.includes(hoveredSite);

            const isOpen = openSite !== null && span.sites.includes(openSite);

            const interactive = innermost !== undefined && span.state === "lit";

            const className = cn(
              "min-h-[1.5em]",
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
              "cursor-pointer border-0 py-0 [font:inherit] hover:brightness-95",
              expanded && "ring-1 ring-inline-output/30",
            )}
            aria-expanded={expanded}
            onClick={() => {
              setExpanded((current) => !current);
            }}
            type="button"
          >
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
          <span className="ml-[2ch] rounded-sm bg-exception/10 px-[0.75ch] text-code-error">
            {line.exception}
          </span>
        )}
      </div>
      {expanded && line.output !== null ? (
        <pre className="m-0 mt-1 mr-4 mb-1.5 ml-gutter rounded-sm border border-inline-output/30 px-[1ch] py-0.5 text-inline-output whitespace-pre-wrap [font:inherit]">
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
