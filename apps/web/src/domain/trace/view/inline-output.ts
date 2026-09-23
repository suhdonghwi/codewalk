import type { InlineSegment } from "./block-view.ts";

export interface OutputPreview {
  segments: InlineSegment[];
  expandable: boolean;
}

const PREVIEW_LENGTH = 48;

function takeSegments(
  segments: InlineSegment[],
  length: number,
): InlineSegment[] {
  const taken: InlineSegment[] = [];
  let remaining = length;

  for (const segment of segments) {
    if (remaining === 0) break;
    const text = segment.text.slice(0, remaining);

    if (text.length > 0) taken.push({ stream: segment.stream, text });
    remaining -= text.length;
  }

  return taken;
}

export function previewInlineOutput(output: InlineSegment[]): OutputPreview {
  const text = output.map((segment) => segment.text).join("");
  const firstBreak = text.indexOf("\n");
  const firstLineLength = firstBreak === -1 ? text.length : firstBreak;
  const expandable = firstBreak !== -1 || text.length > PREVIEW_LENGTH;

  if (!expandable) return { segments: output, expandable: false };

  const shownLength = Math.min(firstLineLength, PREVIEW_LENGTH);
  const segments = takeSegments(output, shownLength);
  const last = segments.at(-1);

  if (last === undefined) {
    segments.push({ stream: "stdout", text: "…" });
  } else {
    last.text += "…";
  }

  return { segments, expandable: true };
}
