export interface SourceLine {
  number: number;
  from: number;
  to: number;
}

export function sourceLines(
  source: string,
  start: number,
  end: number,
): SourceLine[] {
  const displayStart =
    start === 0 ? 0 : source.lastIndexOf("\n", start - 1) + 1;

  const endBreak = source.indexOf("\n", end);
  const displayEnd = endBreak === -1 ? source.length : endBreak;
  const lines: SourceLine[] = [];
  let lineStart = displayStart;
  let number = source.slice(0, displayStart).split("\n").length;

  while (lineStart <= displayEnd) {
    const nextBreak = source.indexOf("\n", lineStart);

    const lineEnd =
      nextBreak === -1 || nextBreak > displayEnd ? displayEnd : nextBreak;

    lines.push({ number, from: lineStart, to: lineEnd });

    if (lineEnd === displayEnd) break;

    lineStart = lineEnd + 1;
    number += 1;
  }

  return lines;
}

export function lineContaining(
  lines: SourceLine[],
  position: number,
): number | null {
  return (
    lines.find((line) => line.from <= position && position <= line.to)
      ?.number ?? null
  );
}

function sharedPrefix(left: string, right: string): string {
  let length = 0;

  while (
    length < left.length &&
    length < right.length &&
    left[length] === right[length]
  ) {
    length += 1;
  }

  return left.slice(0, length);
}

export function trimCommonIndent(
  source: string,
  lines: SourceLine[],
): SourceLine[] {
  let common: string | null = null;

  for (const line of lines) {
    const text = source.slice(line.from, line.to);

    if (text.trim().length === 0) continue;
    const indent = text.slice(0, text.length - text.trimStart().length);
    common = common === null ? indent : sharedPrefix(common, indent);
  }

  const width = common?.length ?? 0;

  return lines.map((line) => ({
    ...line,
    from: Math.min(line.from + width, line.to),
  }));
}
