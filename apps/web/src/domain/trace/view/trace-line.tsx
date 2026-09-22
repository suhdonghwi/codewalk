import { Fragment, useState } from "react";

import { cn } from "@/ui/utils.ts";

import { InlineChip } from "./inline-chip.tsx";
import { previewInlineContent, previewInlineText } from "./inline-output.ts";

import type { Line } from "./block-view.ts";
import type { InlineSegment } from "./inline-output.ts";
import type { Span } from "./spans.ts";
import type { LocId } from "@codewalk/trace";

interface TraceLineProps {
  line: Line;
  row: number;
  anchor: boolean;
  hoveredSite: LocId | null;
  openSite: LocId | null;
  onHoverSite: (site: LocId | null) => void;
  onToggleSite: (site: LocId) => void;
}

interface SegmentsProps {
  segments: InlineSegment[];
}

const STATE_CLASSES: Record<Span["state"], string> = {
  lit: "",
  dimmed: "!text-neutral-500 !not-italic opacity-55",
  inert: "opacity-55",
};

function Segments({ segments }: SegmentsProps) {
  return segments.map((segment, index) => (
    <span
      className={segment.stream === "stderr" ? "text-code-error" : undefined}
      key={index}
    >
      {segment.text}
    </span>
  ));
}

function siteBackground(span: Span): string | undefined {
  if (span.state !== "lit" || span.sites.length === 0) return undefined;
  const strength = Math.min(14, 8 + (span.sites.length - 1) * 2);

  return `color-mix(in srgb, var(--color-site-accent) ${strength}%, transparent)`;
}

export function TraceLine({
  line,
  row,
  anchor,
  hoveredSite,
  openSite,
  onHoverSite,
  onToggleSite,
}: TraceLineProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const valuePreviews = line.values.map((value) =>
    previewInlineText(value.text),
  );

  const outputPreview =
    line.output === null ? null : previewInlineContent(line.output.segments);

  function toggleChip(key: string): void {
    setExpanded((current) => {
      const next = new Set(current);

      if (next.has(key)) next.delete(key);
      else next.add(key);

      return next;
    });
  }

  return (
    <div className="col-start-1 min-w-max" style={{ gridRowStart: row }}>
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
            "sticky left-0 z-2 w-gutter flex-none pr-2 pl-1.5 text-right select-none",
            line.exception === null
              ? "text-line-number"
              : "bg-exception/8 text-exception",
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
              <Fragment key={index}>
                <span
                  className={className}
                  data-trace-site={interactive || undefined}
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
                {line.values.map((value, valueIndex) => {
                  if (value.afterSpan !== index) return null;
                  const preview = valuePreviews[valueIndex];

                  if (preview === undefined) return null;
                  const key = `value-${valueIndex}`;

                  return (
                    <InlineChip
                      className="mx-[0.5ch]"
                      expandable={preview.expandable}
                      expanded={expanded.has(key)}
                      key={key}
                      onToggle={() => {
                        toggleChip(key);
                      }}
                      tone="value"
                    >
                      = <Segments segments={preview.segments} />
                    </InlineChip>
                  );
                })}
              </Fragment>
            );
          })}
        </code>
        {outputPreview === null ? null : (
          <InlineChip
            className="ml-[2ch]"
            expandable={outputPreview.expandable}
            expanded={expanded.has("output")}
            onToggle={() => {
              toggleChip("output");
            }}
            tone="output"
          >
            <Segments segments={outputPreview.segments} />
          </InlineChip>
        )}
        {line.exception === null ? null : (
          <InlineChip className="ml-[2ch]" tone="exception">
            {line.exception}
          </InlineChip>
        )}
      </div>
      {line.values.map((value, index) =>
        expanded.has(`value-${index}`) ? (
          <pre
            className="m-0 mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] rounded-sm bg-inline-value-surface/60 px-[1ch] py-0.5 text-inline-value whitespace-pre-wrap [font:inherit]"
            key={`value-${index}`}
          >
            {value.text}
          </pre>
        ) : null,
      )}
      {expanded.has("output") && line.output !== null ? (
        <pre className="m-0 mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] rounded-sm bg-inline-output-surface/60 px-[1ch] py-0.5 text-inline-output whitespace-pre-wrap [font:inherit]">
          <Segments segments={line.output.segments} />
        </pre>
      ) : null}
    </div>
  );
}
