import { match, P } from "ts-pattern";

import { EventSchema, HeaderSchema, isBlockRole } from "./schema.ts";

import type { End, Header, Role, TraceEvent } from "./schema.ts";
import type {
  OutputChunk,
  ParseResult,
  Trace,
  TraceNode,
  TraceParseError,
} from "./model.ts";

function parseError(
  kind: TraceParseError["kind"],
  line: number,
  message: string,
): ParseResult {
  return { ok: false, error: { kind, line, message } };
}

function structureError(line: number, message: string): TraceParseError {
  return { kind: "structure", line, message };
}

function schemaMessage(error: {
  issues: readonly { message: string }[];
}): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

function validateHeader(header: Header): TraceParseError | null {
  for (let locId = 0; locId < header.locs.length; locId += 1) {
    const loc = header.locs[locId];

    if (loc === undefined) continue;

    if (loc.file >= header.sources.length) {
      return structureError(
        1,
        `loc ${locId} has out-of-range file ${loc.file}`,
      );
    }

    if (loc.parent !== null && loc.parent >= header.locs.length) {
      return structureError(
        1,
        `loc ${locId} has out-of-range parent ${loc.parent}`,
      );
    }

    if (loc.start > loc.end) {
      return structureError(1, `loc ${locId} starts after it ends`);
    }

    const source = header.sources[loc.file];

    if (source !== undefined && loc.end > source.text.length) {
      return structureError(1, `loc ${locId} ends beyond its source text`);
    }
  }

  for (let locId = 0; locId < header.locs.length; locId += 1) {
    const seen = new Set<number>();
    let current: number | null = locId;

    while (current !== null) {
      if (seen.has(current)) {
        return structureError(
          1,
          `loc ${locId} has a cycle in its parent chain`,
        );
      }

      seen.add(current);
      current = header.locs[current]?.parent ?? null;
    }
  }

  return null;
}

function roleCanContain(parent: Role, child: Role): boolean {
  return match<[Role, Role], boolean>([parent, child])
    .with(["block", "stmt"], () => true)
    .with(["stmt", P.union("expr", "block")], () => true)
    .with(["expr", P.union("expr", "block")], () => true)
    .with(["block", P.union("block", "expr")], () => false)
    .with([P.union("stmt", "expr"), "stmt"], () => false)
    .exhaustive();
}

function endFromEvent(event: Extract<TraceEvent, { op: "end" }>): End {
  return match(event)
    .with({ status: "ok" }, (): End => ({ status: "ok" }))
    .with({ status: "truncated" }, (): End => ({ status: "truncated" }))
    .with({ status: "timeout" }, (): End => ({ status: "timeout" }))
    .with({ status: "exception" }, ({ traceback }): End => ({
      status: "exception",
      traceback,
    }))
    .with({ status: "syntax_error" }, ({ message, file, start, end }): End => ({
      status: "syntax_error",
      message,
      file,
      start,
      end,
    }))
    .exhaustive();
}

function validateSyntaxErrorEnd(
  end: Extract<End, { status: "syntax_error" }>,
  header: Header,
  line: number,
): TraceParseError | null {
  if (end.file >= header.sources.length) {
    return structureError(
      line,
      `syntax error has out-of-range file ${end.file}`,
    );
  }

  if (end.start > end.end) {
    return structureError(line, "syntax error starts after it ends");
  }

  const source = header.sources[end.file];

  if (source !== undefined && end.end > source.text.length) {
    return structureError(line, "syntax error ends beyond its source text");
  }

  return null;
}

export function parseTrace(jsonl: string): ParseResult {
  if (jsonl.length === 0) return parseError("empty", 1, "trace is empty");

  const lines = jsonl.split("\n");
  const hasTerminatingNewline = jsonl.endsWith("\n");

  const headerLine = lines[0]?.endsWith("\r")
    ? lines[0].slice(0, -1)
    : lines[0];

  if (headerLine === undefined) return parseError("empty", 1, "trace is empty");

  let headerResult: ReturnType<typeof HeaderSchema.safeParse>;

  try {
    headerResult = HeaderSchema.safeParse(JSON.parse(headerLine));
  } catch {
    if (lines.length === 1 && !hasTerminatingNewline) {
      return parseError(
        "empty",
        1,
        "trace is empty after dropping an incomplete line",
      );
    }

    return parseError("json", 1, "line is not valid JSON");
  }

  if (!headerResult.success) {
    return parseError("schema", 1, schemaMessage(headerResult.error));
  }

  const headerError = validateHeader(headerResult.data);

  if (headerError !== null) return { ok: false, error: headerError };

  const header = headerResult.data;
  const nodes: TraceNode[] = [];
  const outputs: OutputChunk[] = [];
  const open: number[] = [];
  let end: End | null = null;

  for (let index = 1; index < lines.length; index += 1) {
    const rawLine = lines[index];

    if (rawLine === undefined) continue;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;

    if (line.length === 0) continue;

    let eventResult: ReturnType<typeof EventSchema.safeParse>;

    try {
      eventResult = EventSchema.safeParse(JSON.parse(line));
    } catch {
      const isIncompleteFinalLine =
        index === lines.length - 1 && !hasTerminatingNewline;

      if (isIncompleteFinalLine) continue;

      return parseError("json", index + 1, "line is not valid JSON");
    }

    if (end !== null) {
      return parseError("structure", index + 1, "an event appears after end");
    }

    if (!eventResult.success) {
      return parseError("schema", index + 1, schemaMessage(eventResult.error));
    }

    const event = eventResult.data;

    const eventError = match(event)
      .with({ op: "enter" }, ({ loc }) => {
        const enteredLoc = header.locs[loc];

        if (enteredLoc === undefined) {
          return structureError(index + 1, `enter has out-of-range loc ${loc}`);
        }

        if (nodes.length === 0 && !isBlockRole(enteredLoc.role)) {
          return structureError(index + 1, "the first enter is not a block");
        }

        if (nodes.length > 0 && open.length === 0) {
          return structureError(index + 1, "enter would create a second root");
        }

        const parentId = open.at(-1) ?? null;

        if (parentId !== null) {
          const parentNode = nodes[parentId];

          const parentLoc =
            parentNode === undefined ? undefined : header.locs[parentNode.loc];

          if (
            parentLoc === undefined ||
            !roleCanContain(parentLoc.role, enteredLoc.role)
          ) {
            return structureError(
              index + 1,
              `a ${parentLoc?.role ?? "missing"} node cannot contain a ${enteredLoc.role} node`,
            );
          }
        }

        const id = nodes.length;
        nodes.push({
          id,
          loc,
          parent: parentId,
          children: [],
          outputs: [],
          values: [],
          exc: null,
        });

        if (parentId !== null) nodes[parentId]?.children.push(id);
        open.push(id);

        return null;
      })
      .with({ op: "exit" }, ({ exc }) => {
        const nodeId = open.at(-1);

        if (nodeId === undefined) {
          return structureError(index + 1, "exit has no open node");
        }

        const node = nodes[nodeId];
        const loc = node === undefined ? undefined : header.locs[node.loc];

        if (exc !== undefined && !isBlockRole(loc?.role)) {
          return structureError(
            index + 1,
            "exit.exc is only valid on a block node",
          );
        }

        open.pop();

        if (node !== undefined && exc !== undefined) node.exc = exc;

        return null;
      })
      .with({ op: "out" }, ({ stream, text }) => {
        const nodeId = open.at(-1);

        if (nodeId === undefined) {
          return structureError(index + 1, "out has no open node");
        }

        const outputId = outputs.length;
        outputs.push({ node: nodeId, stream, text });
        nodes[nodeId]?.outputs.push(outputId);

        return null;
      })
      .with({ op: "value" }, ({ loc, text }) => {
        const valueLoc = header.locs[loc];

        if (valueLoc === undefined) {
          return structureError(index + 1, `value has out-of-range loc ${loc}`);
        }

        if (valueLoc.role !== "expr") {
          return structureError(index + 1, "value loc is not an expr");
        }

        const nodeId = open.at(-1);

        if (nodeId === undefined) {
          return structureError(index + 1, "value has no open node");
        }

        const node = nodes[nodeId];

        if (node === undefined || !isBlockRole(header.locs[node.loc]?.role)) {
          return structureError(index + 1, "value is not attached to a block");
        }

        node.values.push({ loc, text });

        return null;
      })
      .with({ op: "end" }, (endEvent) => {
        const parsedEnd = endFromEvent(endEvent);

        const semanticError = match(parsedEnd)
          .with({ status: "syntax_error" }, (syntaxEnd) => {
            if (nodes.length > 0) {
              return structureError(
                index + 1,
                "syntax_error end follows enter events",
              );
            }

            return validateSyntaxErrorEnd(syntaxEnd, header, index + 1);
          })
          .with(
            { status: P.union("ok", "truncated", "timeout", "exception") },
            () => null,
          )
          .exhaustive();

        if (semanticError !== null) return semanticError;
        end = parsedEnd;
        open.length = 0;

        return null;
      })
      .exhaustive();

    if (eventError !== null) return { ok: false, error: eventError };
  }

  const trace: Trace = {
    header,
    nodes,
    outputs,
    root: nodes.length === 0 ? null : 0,
    end: end ?? { status: "timeout" },
  };

  return { ok: true, trace };
}
