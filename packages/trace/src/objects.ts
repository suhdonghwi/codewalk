import type { ObjectVersion, Trace } from "./model.ts";
import type { HeapObject, ObjectId } from "./schema.ts";

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
