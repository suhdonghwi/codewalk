import { useState } from "react";

import { previewInlineOutput } from "./inline-output.ts";

import type { Line, Span } from "./block-view.ts";
import type { LocId } from "@codewalk/trace";

interface TraceLineProps {
  line: Line;
  anchor: boolean;
  hoveredSite: LocId | null;
  openSite: LocId | null;
  onHoverSite: (site: LocId | null) => void;
  onToggleSite: (site: LocId) => void;
}

function siteBackground(span: Span): string | undefined {
  if (span.state !== "lit" || span.sites.length === 0) return undefined;
  const strength = Math.min(14, 8 + (span.sites.length - 1) * 2);

  return `color-mix(in srgb, var(--site-accent) ${strength}%, transparent)`;
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
    <div className="trace-line">
      <div className="trace-line-main" data-site-anchor={anchor || undefined}>
        <span
          aria-hidden
          className={`trace-gutter${line.exception === null ? "" : " trace-gutter-exception"}`}
        >
          {line.number}
        </span>
        <code className="trace-line-code">
          {line.spans.map((span, index) => {
            const innermost = span.sites.at(-1);

            const isHovered =
              hoveredSite !== null && span.sites.includes(hoveredSite);

            const isOpen = openSite !== null && span.sites.includes(openSite);

            const interactive = innermost !== undefined && span.state === "lit";

            const className = [
              "trace-span",
              `trace-${span.state}`,
              span.classes,
              interactive ? "trace-site" : "",
              isHovered ? "trace-site-hovered" : "",
              isOpen ? "trace-site-open" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <span
                className={className}
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
            className="trace-inline-output trace-output-toggle"
            onClick={() => {
              setExpanded((current) => !current);
            }}
            type="button"
          >
            {preview.segments.map((segment, index) => (
              <span
                className={
                  segment.stream === "stderr"
                    ? "trace-output-stderr"
                    : undefined
                }
                key={index}
              >
                {segment.text}
              </span>
            ))}
          </button>
        ) : (
          <span className="trace-inline-output">
            {preview.segments.map((segment, index) => (
              <span
                className={
                  segment.stream === "stderr"
                    ? "trace-output-stderr"
                    : undefined
                }
                key={index}
              >
                {segment.text}
              </span>
            ))}
          </span>
        )}
        {line.exception === null ? null : (
          <span className="trace-exception">{line.exception}</span>
        )}
      </div>
      {expanded && line.output !== null ? (
        <pre className="trace-output-full">
          {line.output.segments.map((segment, index) => (
            <span
              className={
                segment.stream === "stderr" ? "trace-output-stderr" : undefined
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
