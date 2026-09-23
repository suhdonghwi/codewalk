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
