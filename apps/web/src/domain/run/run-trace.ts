import { parseTrace } from "@codewalk/trace";

import type { RunOutcome, RunRequest } from "./types.ts";

export async function runTrace(request: RunRequest): Promise<RunOutcome> {
  try {
    const response = await fetch("/api/run", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(request),
    });

    if (!response.ok) return { kind: "failed", status: response.status };

    const result = parseTrace(await response.text());

    return result.ok
      ? { kind: "trace", trace: result.trace }
      : { kind: "invalid", error: result.error };
  } catch {
    return { kind: "unreachable" };
  }
}
