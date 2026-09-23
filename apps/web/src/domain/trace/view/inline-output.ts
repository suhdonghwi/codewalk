import type { InlineOutput } from "./block-view.ts";

export interface OutputPreview {
  segments: InlineOutput["segments"];
  expandable: boolean;
}

const PREVIEW_LENGTH = 48;

function takeSegments(
  segments: InlineOutput["segments"],
  length: number,
): InlineOutput["segments"] {
  const taken: InlineOutput["segments"] = [];
  let remaining = length;

  for (const segment of segments) {
    if (remaining === 0) break;
    const text = segment.text.slice(0, remaining);

    if (text.length > 0) taken.push({ stream: segment.stream, text });
    remaining -= text.length;
  }

  return taken;
}

export function previewInlineOutput(output: InlineOutput): OutputPreview {
  const text = output.segments.map((segment) => segment.text).join("");
  const firstBreak = text.indexOf("\n");
  const firstLineLength = firstBreak === -1 ? text.length : firstBreak;
  const expandable = firstBreak !== -1 || text.length > PREVIEW_LENGTH;

  if (!expandable) return { segments: output.segments, expandable: false };

  const shownLength = Math.min(firstLineLength, PREVIEW_LENGTH);
  const segments = takeSegments(output.segments, shownLength);
  const last = segments.at(-1);

  if (last === undefined) {
    segments.push({ stream: "stdout", text: "…" });
  } else {
    last.text += "…";
  }

  return { segments, expandable: true };
}
