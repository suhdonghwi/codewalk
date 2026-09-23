import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test } from "vitest";

import { buildApp } from "./app.ts";
import type { RunRequest, Runner } from "./runner.ts";
import { SubprocessRunner } from "./subprocess-runner.ts";

const apps: ReturnType<typeof buildApp>[] = [];

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
  await Promise.all(
    roots
      .splice(0)
      .map(async (root) => rm(root, { recursive: true, force: true })),
  );
});

class RequestTraceRunner implements Runner {
  async run(request: RunRequest): Promise<string> {
    return `${JSON.stringify({
      codewalk: 2,
      plain: { sequence: "list", set: "set", mapping: "dict" },
      sources: [
        {
          file: "main.py",
          text: `source=${request.source};stdin=${request.stdin}`,
        },
      ],
      locs: [],
    })}\n${JSON.stringify({ op: "end", status: "ok" })}\n`;
  }
}

test("the run endpoint validates both fields and relays a trace as NDJSON", async () => {
  const app = buildApp({ runner: new RequestTraceRunner() });

  apps.push(app);

  const valid = await app.inject({
    method: "POST",
    url: "/api/run",
    payload: { source: "print('ok')\n", stdin: "input\n" },
  });

  const missing = await app.inject({
    method: "POST",
    url: "/api/run",
    payload: { source: "print('missing stdin')\n" },
  });

  const malformed = await app.inject({
    method: "POST",
    url: "/api/run",
    headers: { "content-type": "application/json" },
    payload: "{",
  });

  const overlong = await app.inject({
    method: "POST",
    url: "/api/run",
    payload: { source: "x".repeat(100_001), stdin: "" },
  });

  expect(valid.statusCode).toBe(200);
  expect(valid.headers["content-type"]).toBe(
    "application/x-ndjson; charset=utf-8",
  );
  expect(valid.body).toContain(
    '"text":"source=print(\'ok\')\\n;stdin=input\\n"',
  );
  expect(missing.statusCode).toBe(400);
  expect(missing.body).toBe('{"error":"invalid_request"}');
  expect(malformed.statusCode).toBe(400);
  expect(malformed.body).toBe('{"error":"invalid_request"}');
  expect(overlong.statusCode).toBe(400);
  expect(overlong.body).toBe('{"error":"invalid_request"}');
});

test("a runner startup failure returns only the runner_failed error", async () => {
  const root = await mkdtemp(join(tmpdir(), "codewalk-http-test-"));

  const runner = new SubprocessRunner({
    pythonPath: join(root, "path-containing-a-secret", "python"),
    timeLimit: 1,
    maxTraceBytes: 64 * 1024,
    tempRoot: root,
  });

  const app = buildApp({ runner });

  roots.push(root);
  apps.push(app);

  const response = await app.inject({
    method: "POST",
    url: "/api/run",
    payload: { source: "print('never')\n", stdin: "" },
  });

  expect(response.statusCode).toBe(500);
  expect(response.body).toBe('{"error":"runner_failed"}');
  expect(response.body).not.toContain("secret");
});
