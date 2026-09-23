import { match, P } from "ts-pattern";

import { objectValues } from "./objects.ts";
import { EventSchema, HeaderSchema } from "./schema.ts";

import type { Header, LocId, Role, TraceEvent, Value } from "./schema.ts";
import type {
  ParseResult,
  Site,
  Trace,
  TraceLoc,
  TraceNode,
  ValueChunk,
} from "./model.ts";

const CONTAINS: Record<Role, readonly Role[]> = {
  block: ["stmt"],
  stmt: ["expr", "block"],
  expr: ["expr", "block"],
};

function failure(line: number, message: string): ParseResult {
  return { ok: false, error: { line, message } };
}

function schemaMessage(error: {
  issues: readonly { message: string }[];
}): string {
  return error.issues.map((issue) => issue.message).join("; ");
}

function rangeProblem(
  text: string,
  range: { start: number; end: number },
): string | null {
  if (range.start > range.end) return "starts after it ends";

  if (range.end > text.length) return "ends beyond its source text";

  return null;
}

function locsProblem({ locs, source }: Header): string | null {
  for (const [id, loc] of locs.entries()) {
    if (loc.parent !== null && loc.parent >= locs.length) {
      return `loc ${id} has out-of-range parent ${loc.parent}`;
    }

    const problem = rangeProblem(source.text, loc);

    if (problem !== null) return `loc ${id} ${problem}`;
  }

  for (const [id, loc] of locs.entries()) {
    const seen = new Set([id]);

    for (
      let current = loc.parent;
      current !== null;
      current = locs[current]?.parent ?? null
    ) {
      if (seen.has(current)) return `loc ${id} has a cycle in its parent chain`;
      seen.add(current);
    }
  }

  return null;
}

function resolveLocs({ locs }: Header): TraceLoc[] {
  return locs.map((loc, id) => {
    let owner: LocId | null = loc.parent;

    while (owner !== null && locs[owner]?.role !== "block") {
      owner = locs[owner]?.parent ?? null;
    }

    return { ...loc, id, owner };
  });
}

function collectSites(block: TraceNode): void {
  const sitesByLoc = new Map<LocId, Site>();

  const visit = (node: TraceNode): void => {
    const blocks = node.children.filter((child) => child.loc.role === "block");

    if (blocks.length > 0 || node.outputs.length > 0) {
      let site = sitesByLoc.get(node.loc.id);

      if (site === undefined) {
        site = { loc: node.loc, blocks: [], outputs: [] };
        sitesByLoc.set(node.loc.id, site);
        block.sites.push(site);
      }

      // Not `push(...blocks)`: a loop statement can hold more iterations
      // than the engine accepts as call arguments.
      for (const child of blocks) site.blocks.push(child);

      for (const output of node.outputs) site.outputs.push(output);
    }

    for (const child of node.children) {
      if (child.loc.role !== "block") visit(child);
    }
  };

  for (const child of block.children) visit(child);
}

export function parseTrace(jsonl: string): ParseResult {
  if (jsonl.length === 0) return failure(1, "trace is empty");

  const lines = jsonl.split("\n");
  const complete = jsonl.endsWith("\n");

  let headerResult: ReturnType<typeof HeaderSchema.safeParse>;

  try {
    headerResult = HeaderSchema.safeParse(JSON.parse(lines[0] ?? ""));
  } catch {
    return lines.length === 1 && !complete
      ? failure(1, "trace is empty after dropping an incomplete line")
      : failure(1, "line is not valid JSON");
  }

  if (!headerResult.success) {
    return failure(1, schemaMessage(headerResult.error));
  }

  const header = headerResult.data;
  const headerProblem = locsProblem(header);

  if (headerProblem !== null) return failure(1, headerProblem);

  const locs = resolveLocs(header);

  const trace: Trace = {
    source: header.source,
    literals: header.literals,
    locs,
    nodes: [],
    outputs: [],
    objects: [],
    end: { status: "timeout" },
  };

  const open: TraceNode[] = [];
  const undefinedReferences = new Set<number>();
  let definitions = 0;
  let ended = false;

  function referenceProblem(value: Value): string | null {
    if ("ref" in value && value.ref >= trace.objects.length) {
      return `value refers to undefined object ${value.ref}`;
    }

    const [pending] = undefinedReferences;

    return pending === undefined
      ? null
      : `value follows a reference to undefined object ${pending}`;
  }

  function attachValue(value: ValueChunk): string | null {
    const problem = referenceProblem(value.value);

    if (problem !== null) return problem;

    const node = open.at(-1);

    if (node === undefined) return "value has no open node";

    if (value.loc !== null && node.loc.role !== "block") {
      return "value is not attached to a block";
    }

    if (node.loc.role === "expr") {
      return "a named value is attached to an expression";
    }

    node.values.push(value);

    return null;
  }

  function apply(event: TraceEvent): string | null {
    return match(event)
      .with({ op: "enter" }, ({ loc: locId }) => {
        const loc = locs[locId];

        if (loc === undefined) return `enter has out-of-range loc ${locId}`;

        const parent = open.at(-1) ?? null;

        if (trace.nodes.length === 0 && loc.role !== "block") {
          return "the first enter is not a block";
        }

        if (trace.nodes.length > 0 && parent === null) {
          return "enter would create a second root";
        }

        if (parent !== null && !CONTAINS[parent.loc.role].includes(loc.role)) {
          return `a ${parent.loc.role} node cannot contain a ${loc.role} node`;
        }

        const node: TraceNode = {
          id: trace.nodes.length,
          loc,
          parent,
          children: [],
          sites: [],
          outputs: [],
          values: [],
          returned: null,
          exc: null,
        };

        trace.nodes.push(node);
        parent?.children.push(node);
        open.push(node);

        return null;
      })
      .with({ op: "exit" }, ({ exc }) => {
        const node = open.pop();

        if (node === undefined) return "exit has no open node";

        if (exc === undefined) return null;

        if (node.loc.role === "expr") {
          return "exit.exc is only valid on a block or stmt node";
        }

        node.exc = exc;

        return null;
      })
      .with({ op: "out" }, ({ stream, text }) => {
        const node = open.at(-1);

        if (node === undefined) return "out has no open node";

        node.outputs.push(trace.outputs.length);
        trace.outputs.push({ node, stream, text });

        return null;
      })
      .with({ op: "value", loc: P.number }, ({ loc: locId, value }) => {
        const loc = locs[locId];

        if (loc === undefined) return `value has out-of-range loc ${locId}`;

        if (loc.role !== "expr") return "value loc is not an expr";

        return attachValue({
          loc,
          name: trace.source.text.slice(loc.start, loc.end),
          value,
          at: definitions,
          literal: false,
        });
      })
      .with({ op: "value", name: P.string }, ({ name, value, literal }) =>
        attachValue({
          loc: null,
          name,
          value,
          at: definitions,
          literal: literal ?? false,
        }),
      )
      .with({ op: "return" }, ({ value, literal }) => {
        const problem = referenceProblem(value);

        if (problem !== null) return problem;

        const node = open.at(-1);

        if (node?.loc.role !== "stmt") {
          return "return is not attached to a statement";
        }

        if (node.returned !== null) return "a statement returns twice";

        node.returned = { value, at: definitions, literal: literal ?? false };

        return null;
      })
      .with({ op: "obj" }, ({ op: _op, id, ...object }) => {
        if (id > trace.objects.length) {
          return `obj ${id} skips ahead of the next new id ${trace.objects.length}`;
        }

        if (id === trace.objects.length) trace.objects.push([]);
        trace.objects[id]?.push({ at: definitions, object });
        definitions += 1;
        undefinedReferences.delete(id);

        for (const value of objectValues(object)) {
          if ("ref" in value && value.ref >= trace.objects.length) {
            undefinedReferences.add(value.ref);
          }
        }

        return null;
      })
      .with({ op: "end" }, ({ op: _op, ...end }) => {
        if (end.status === "syntax_error") {
          if (trace.nodes.length > 0) {
            return "syntax_error end follows enter events";
          }

          const problem = rangeProblem(trace.source.text, end);

          if (problem !== null) return `syntax error ${problem}`;
        }

        trace.end = end;
        ended = true;
        open.length = 0;

        return null;
      })
      .exhaustive();
  }

  for (const [index, line] of lines.entries()) {
    if (index === 0 || line.length === 0) continue;

    let eventResult: ReturnType<typeof EventSchema.safeParse>;

    try {
      eventResult = EventSchema.safeParse(JSON.parse(line));
    } catch {
      if (index === lines.length - 1 && !complete) continue;

      return failure(index + 1, "line is not valid JSON");
    }

    if (ended) return failure(index + 1, "an event appears after end");

    if (!eventResult.success) {
      return failure(index + 1, schemaMessage(eventResult.error));
    }

    const problem = apply(eventResult.data);

    if (problem !== null) return failure(index + 1, problem);
  }

  for (const node of trace.nodes) {
    if (node.loc.role === "block") collectSites(node);
  }

  return { ok: true, trace };
}
