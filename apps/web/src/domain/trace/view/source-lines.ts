export interface SourceLine {
  number: number;
  from: number;
  to: number;
}

function countLineBreaks(text: string, end: number): number {
  let count = 0;

  for (let index = 0; index < end; index += 1) {
    if (text[index] === "\n") count += 1;
  }

  return count;
}

function sourceLineNumber(source: string, position: number): number {
  return countLineBreaks(source, position) + 1;
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
  const firstNumber = sourceLineNumber(source, displayStart);
  const lines: SourceLine[] = [];
  let lineStart = displayStart;
  let number = firstNumber;

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
  source: string,
  lines: SourceLine[],
  position: number,
): number | null {
  const number = sourceLineNumber(source, position);
  const line = lines.find((candidate) => candidate.number === number);

  return line?.number ?? null;
}
