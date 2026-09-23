import { match, P } from "ts-pattern";

import { objectValues } from "./objects.ts";
import { EventSchema, HeaderSchema } from "./schema.ts";

import type { End, Header, Role, TraceEvent, Value } from "./schema.ts";
import type {
  ObjectVersion,
  OutputChunk,
  ParseResult,
  Trace,
  TraceNode,
  TraceParseError,
  ValueChunk,
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

function rangeProblem(
  header: Header,
  range: { file: number; start: number; end: number },
): string | null {
  if (range.file >= header.sources.length) {
    return `has out-of-range file ${range.file}`;
  }

  if (range.start > range.end) return "starts after it ends";

  const source = header.sources[range.file];

  if (source !== undefined && range.end > source.text.length) {
    return "ends beyond its source text";
  }

  return null;
}

function validateHeader(header: Header): TraceParseError | null {
  for (let locId = 0; locId < header.locs.length; locId += 1) {
    const loc = header.locs[locId];

    if (loc === undefined) continue;

    if (loc.parent !== null && loc.parent >= header.locs.length) {
      return structureError(
        1,
        `loc ${locId} has out-of-range parent ${loc.parent}`,
      );
    }

    const problem = rangeProblem(header, loc);

    if (problem !== null) return structureError(1, `loc ${locId} ${problem}`);
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
  const { op: _op, ...end } = event;

  return end;
}

function validateSyntaxErrorEnd(
  end: Extract<End, { status: "syntax_error" }>,
  header: Header,
  line: number,
): TraceParseError | null {
  const problem = rangeProblem(header, end);

  return problem === null
    ? null
    : structureError(line, `syntax error ${problem}`);
}

export function parseTrace(jsonl: string): ParseResult {
  if (jsonl.length === 0) return parseError("empty", 1, "trace is empty");

  const lines = jsonl.split("\n");
  const hasTerminatingNewline = jsonl.endsWith("\n");

  const [headerLine = ""] = lines;

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
  const objects: ObjectVersion[][] = [];
  const undefinedReferences = new Set<number>();
  let definitions = 0;
  const open: number[] = [];
  let end: End | null = null;

  function referenceError(line: number, value: Value): TraceParseError | null {
    if ("ref" in value && value.ref >= objects.length) {
      return structureError(
        line,
        `value refers to undefined object ${value.ref}`,
      );
    }

    const [pending] = undefinedReferences;

    return pending === undefined
      ? null
      : structureError(
          line,
          `value follows a reference to undefined object ${pending}`,
        );
  }

  function attachValue(
    line: number,
    value: ValueChunk,
  ): TraceParseError | null {
    const error = referenceError(line, value.value);

    if (error !== null) return error;

    const nodeId = open.at(-1);

    if (nodeId === undefined) {
      return structureError(line, "value has no open node");
    }

    const node = nodes[nodeId];
    const role = node === undefined ? undefined : header.locs[node.loc]?.role;

    if (node === undefined || (value.loc !== null && role !== "block")) {
      return structureError(line, "value is not attached to a block");
    }

    if (role === "expr") {
      return structureError(line, "a named value is attached to an expression");
    }

    node.values.push(value);

    return null;
  }

  for (let index = 1; index < lines.length; index += 1) {
    const line = lines[index];

    if (line === undefined || line.length === 0) continue;

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

        if (nodes.length === 0 && enteredLoc.role !== "block") {
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
          returned: null,
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

        if (exc !== undefined && loc?.role === "expr") {
          return structureError(
            index + 1,
            "exit.exc is only valid on a block or stmt node",
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
      .with({ op: "value", loc: P.number }, ({ loc, value }) => {
        const valueLoc = header.locs[loc];

        if (valueLoc === undefined) {
          return structureError(index + 1, `value has out-of-range loc ${loc}`);
        }

        if (valueLoc.role !== "expr") {
          return structureError(index + 1, "value loc is not an expr");
        }

        const source = header.sources[valueLoc.file]?.text ?? "";
        const name = source.slice(valueLoc.start, valueLoc.end);

        return attachValue(index + 1, { loc, name, value, at: definitions });
      })
      .with({ op: "value", name: P.string }, ({ name, value }) =>
        attachValue(index + 1, { loc: null, name, value, at: definitions }),
      )
      .with({ op: "return" }, ({ value }) => {
        const error = referenceError(index + 1, value);

        if (error !== null) return error;

        const nodeId = open.at(-1);
        const node = nodeId === undefined ? undefined : nodes[nodeId];

        if (node === undefined || header.locs[node.loc]?.role !== "stmt") {
          return structureError(
            index + 1,
            "return is not attached to a statement",
          );
        }

        if (node.returned !== null) {
          return structureError(index + 1, "a statement returns twice");
        }

        node.returned = { value, at: definitions };

        return null;
      })
      .with({ op: "obj" }, ({ op: _op, id, ...object }) => {
        if (id > objects.length) {
          return structureError(
            index + 1,
            `obj ${id} skips ahead of the next new id ${objects.length}`,
          );
        }

        if (id === objects.length) objects.push([]);
        objects[id]?.push({ at: definitions, object });
        definitions += 1;
        undefinedReferences.delete(id);

        for (const value of objectValues(object)) {
          if ("ref" in value && value.ref >= objects.length) {
            undefinedReferences.add(value.ref);
          }
        }

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
    objects,
    root: nodes.length === 0 ? null : 0,
    end: end ?? { status: "timeout" },
  };

  return { ok: true, trace };
}
