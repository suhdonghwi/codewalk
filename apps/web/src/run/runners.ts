import { parseTrace } from "@codewalk/trace";

import type { RunOutcome, RunRequest, TraceRunner } from "./types.ts";

function parsedOutcome(text: string): RunOutcome {
  const result = parseTrace(text);

  return result.ok
    ? { kind: "trace", trace: result.trace }
    : { kind: "invalid", error: result.error };
}

export function createHttpRunner(): TraceRunner {
  return {
    async run(request: RunRequest): Promise<RunOutcome> {
      try {
        const response = await fetch("/api/run", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          return {
            kind: "unreachable",
            message: `Server returned ${response.status}`,
          };
        }

        return parsedOutcome(await response.text());
      } catch {
        return { kind: "unreachable", message: "Network request failed" };
      }
    },
  };
}

export function createFixtureRunner(): TraceRunner {
  return {
    async run(_request: RunRequest): Promise<RunOutcome> {
      const fixture =
        await import("../../../../spec/fixtures/fact.trace.jsonl?raw");

      return parsedOutcome(fixture.default);
    },
  };
}
