import type { ObjectVersion, Trace } from "./model.ts";
import type { HeapObject, ObjectId } from "./schema.ts";

export function objectAt(
  trace: Trace,
  id: ObjectId,
  at: number,
): HeapObject | null {
  const versions: ObjectVersion[] = trace.objects[id] ?? [];
  let low = 0;
  let high = versions.length;

  while (low < high) {
    const middle = (low + high) >> 1;

    if ((versions[middle]?.at ?? at) < at) low = middle + 1;
    else high = middle;
  }

  return versions[low - 1]?.object ?? null;
}
