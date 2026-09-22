export interface InlineSegment {
  stream?: "stdout" | "stderr";
  text: string;
}

export interface InlinePreview {
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

    if (text.length > 0) taken.push({ ...segment, text });
    remaining -= text.length;
  }

  return taken;
}

export function previewInlineContent(segments: InlineSegment[]): InlinePreview {
  const text = segments.map((segment) => segment.text).join("");
  const firstBreak = text.indexOf("\n");
  const firstLineLength = firstBreak === -1 ? text.length : firstBreak;
  const expandable = firstBreak !== -1 || text.length > PREVIEW_LENGTH;

  if (!expandable) return { segments, expandable: false };

  const shownLength = Math.min(firstLineLength, PREVIEW_LENGTH);
  const previewSegments = takeSegments(segments, shownLength);
  const last = previewSegments.at(-1);

  if (last === undefined) {
    previewSegments.push({ text: "…" });
  } else {
    last.text += "…";
  }

  return { segments: previewSegments, expandable: true };
}

export function previewInlineText(text: string): InlinePreview {
  return previewInlineContent([{ text }]);
}
