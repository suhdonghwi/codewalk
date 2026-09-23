import { parseTrace } from "@codewalk/trace";

import type { RunOutcome, RunRequest, TraceRunner } from "./types.ts";

const fixtureFiles = import.meta.glob<string>(
  "../../../../../spec/fixtures/*.trace.jsonl",
  { query: "?raw", import: "default" },
);

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
          return { kind: "failed", status: response.status };
        }

        return parsedOutcome(await response.text());
      } catch {
        return { kind: "unreachable" };
      }
    },
  };
}

export function createFixtureRunner(): TraceRunner {
  return {
    async run(_request: RunRequest): Promise<RunOutcome> {
      const requested = new URLSearchParams(window.location.search).get(
        "fixture",
      );

      const name = requested ?? "fact";

      const load =
        fixtureFiles[`../../../../../spec/fixtures/${name}.trace.jsonl`] ??
        fixtureFiles["../../../../../spec/fixtures/fact.trace.jsonl"];

      if (load === undefined) {
        return { kind: "unreachable" };
      }

      return parsedOutcome(await load());
    },
  };
}
