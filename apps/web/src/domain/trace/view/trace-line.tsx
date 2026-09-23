import { Fragment, useState } from "react";

import { cn } from "@/ui/utils.ts";

import { InlineChip } from "./inline-chip.tsx";
import { previewInlineOutput } from "./inline-output.ts";
import { ValueChip } from "./value-chip.tsx";
import { ValueInspector } from "./value-inspector.tsx";

import type { InlineSegment, Line } from "./block-view.ts";
import type { Span } from "./spans.ts";
import type { LocId, Trace, ValueChunk } from "@codewalk/trace";

interface TraceLineProps {
  trace: Trace;
  line: Line;
  row: number;
  anchor: boolean;
  hoveredSite: LocId | null;
  openSite: LocId | null;
  varyingNames: string[];
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

interface OpenValue {
  key: string;
  entry: ValueChunk;
}

export function TraceLine({
  trace,
  line,
  row,
  anchor,
  hoveredSite,
  openSite,
  varyingNames,
  onHoverSite,
  onToggleSite,
}: TraceLineProps) {
  const [expanded, setExpanded] = useState(false);
  const [openKeys, setOpenKeys] = useState<string[]>([]);

  function toggleValue(key: string): void {
    setOpenKeys((current) =>
      current.includes(key)
        ? current.filter((open) => open !== key)
        : [...current, key],
    );
  }

  const valueEntries: OpenValue[] = [
    ...line.spans.flatMap((span, index) =>
      span.value === null
        ? []
        : [{ key: `anchor:${index}`, entry: span.value }],
    ),
    ...line.values.map((entry) => ({ key: `value:${entry.name}`, entry })),
    ...line.changes.map((entry, index) => ({ key: `change:${index}`, entry })),
  ];

  const openValues = valueEntries.filter(({ key }) => openKeys.includes(key));

  const outputPreview =
    line.output === null ? null : previewInlineOutput(line.output);

  return (
    <div
      className="col-span-full grid grid-cols-subgrid"
      style={{ gridRowStart: row }}
    >
      <div
        className={cn(
          "col-span-full grid min-h-code-line grid-cols-subgrid items-baseline whitespace-pre",
          line.exception === null ? "hover:bg-neutral-50" : "bg-exception/8",
        )}
        data-site-anchor={anchor || undefined}
      >
        <div className="flex items-baseline pr-[2ch]">
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

              const interactive =
                innermost !== undefined && span.state === "lit";

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
                  {span.value === null ? null : (
                    <ValueChip
                      className="mx-[0.5ch]"
                      entry={span.value}
                      expanded={openKeys.includes(`anchor:${index}`)}
                      onToggle={() => {
                        toggleValue(`anchor:${index}`);
                      }}
                      trace={trace}
                    />
                  )}
                </Fragment>
              );
            })}
          </code>
        </div>
        <div className="flex items-baseline gap-[1ch] pr-4">
          {line.values.map((entry) => (
            <ValueChip
              entry={entry}
              expanded={openKeys.includes(`value:${entry.name}`)}
              faded={!varyingNames.includes(entry.name)}
              key={entry.name}
              label={`${entry.name} =`}
              onToggle={() => {
                toggleValue(`value:${entry.name}`);
              }}
              trace={trace}
            />
          ))}
          {line.changes.map((entry, index) => (
            <ValueChip
              entry={entry}
              expanded={openKeys.includes(`change:${index}`)}
              key={index}
              label={`${entry.name} →`}
              onToggle={() => {
                toggleValue(`change:${index}`);
              }}
              trace={trace}
            />
          ))}
          {outputPreview === null ? null : (
            <InlineChip
              expandable={outputPreview.expandable}
              expanded={expanded}
              onToggle={() => {
                setExpanded((current) => !current);
              }}
              tone="output"
            >
              <Segments segments={outputPreview.segments} />
            </InlineChip>
          )}
          {line.exception === null ? null : (
            <InlineChip tone="exception">{line.exception}</InlineChip>
          )}
        </div>
      </div>
      {openValues.length === 0 ? null : (
        <div className="col-span-full mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] flex flex-col gap-1">
          {openValues.map(({ key, entry }) => (
            <ValueInspector
              at={entry.at}
              key={key}
              name={entry.name}
              trace={trace}
              value={entry.value}
            />
          ))}
        </div>
      )}
      {expanded && line.output !== null ? (
        <pre className="col-span-full m-0 mt-1 mr-4 mb-1.5 ml-[calc(var(--spacing-gutter)+0.625rem)] rounded-sm bg-inline-output-surface/60 px-[1ch] py-0.5 text-inline-output whitespace-pre-wrap [font:inherit]">
          <Segments segments={line.output} />
        </pre>
      ) : null}
    </div>
  );
}
