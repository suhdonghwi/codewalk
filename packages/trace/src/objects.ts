import { match, P } from "ts-pattern";

import type { ObjectVersion, Trace } from "./model.ts";
import type { HeapObject, ObjectId, Value } from "./schema.ts";

export function objectValues(object: HeapObject): Value[] {
  return match(object)
    .with({ kind: P.union("sequence", "set") }, ({ items }) => items)
    .with({ kind: "mapping" }, ({ entries }) => entries.flat())
    .with({ kind: "record" }, ({ fields }) => fields.map(([, value]) => value))
    .with({ kind: "opaque" }, () => [])
    .exhaustive();
}

export function requireObject(
  trace: Trace,
  id: ObjectId,
  at: number,
): HeapObject {
  const versions: ObjectVersion[] = trace.objects[id] ?? [];
  let low = 0;
  let high = versions.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if ((versions[middle]?.at ?? at) < at) low = middle + 1;
    else high = middle;
  }

  const object = versions[low - 1]?.object;

  if (object === undefined) {
    throw new Error(`Object ${id} is not defined before ${at}`);
  }

  return object;
}
