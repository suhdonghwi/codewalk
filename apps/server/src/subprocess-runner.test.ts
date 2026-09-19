import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, expect, test } from "vitest";

import { parseTrace, type Trace } from "@codewalk/trace";

import { RunnerError } from "./runner.ts";
import {
  SubprocessRunner,
  type SubprocessRunnerOptions,
} from "./subprocess-runner.ts";

const PYTHON = fileURLToPath(
  new URL("../../tracer-python/.venv/bin/python", import.meta.url),
);

const roots: string[] = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "codewalk-runner-test-"));

  roots.push(root);

  return root;
}

function options(
  root: string,
  overrides: Partial<SubprocessRunnerOptions> = {},
): SubprocessRunnerOptions {
  return {
    pythonPath: PYTHON,
    timeLimit: 1,
    maxEvents: 1_000_000_000,
    maxTraceBytes: 1024 * 1024,
    killGraceMs: 1_000,
    tempRoot: root,
    ...overrides,
  };
}

function traceFrom(text: string): Trace {
  const result = parseTrace(text);

  expect(result.ok).toBe(true);

  if (!result.ok) throw new Error(result.error.message);

  return result.trace;
}

function output(trace: Trace): string {
  return trace.outputs.map((chunk) => chunk.text).join("");
}

async function processExists(marker: string): Promise<boolean> {
  const entries = await readdir("/proc", { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;

    try {
      const commandLine = await readFile(`/proc/${entry.name}/cmdline`, "utf8");

      if (commandLine.includes(marker)) return true;
    } catch {
      // Processes may exit while /proc is being scanned.
    }
  }

  return false;
}

async function expectProcessGone(marker: string): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (!(await processExists(marker))) return;

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  expect(await processExists(marker)).toBe(false);
}

test("runs real source with stdin without exposing the server environment", async () => {
  const root = await tempRoot();
  const runner = new SubprocessRunner(options(root));
  const sentinel = "CODEWALK_RUNNER_TEST_SECRET";

  process.env[sentinel] = "must-not-leak";

  try {
    const text = await runner.run({
      source: `import os
value = input()
print(value, os.getenv("${sentinel}", "absent"))
`,
      stdin: "hello\n",
    });

    const trace = traceFrom(text);

    expect(trace.end).toEqual({ status: "ok" });
    expect(output(trace)).toContain("hello absent\n");
    expect(await readdir(root)).toEqual([]);
  } finally {
    delete process.env[sentinel];
  }
});

test("an infinite loop stops cooperatively before the hard-kill grace", async () => {
  const root = await tempRoot();

  const runner = new SubprocessRunner(
    options(root, { timeLimit: 0.2, killGraceMs: 5_000 }),
  );

  const started = performance.now();

  const text = await runner.run({
    source: "import time\nwhile True:\n    time.sleep(0.01)\n",
    stdin: "",
  });

  const elapsed = performance.now() - started;

  expect(traceFrom(text).end).toEqual({ status: "timeout" });
  expect(elapsed).toBeLessThan(2_000);
});

test("the hard-kill backstop terminates the whole process group and leaves a parseable timeout", async () => {
  const root = await tempRoot();
  const marker = `codewalk-child-${crypto.randomUUID()}`;

  const runner = new SubprocessRunner(
    options(root, { timeLimit: 0.4, killGraceMs: 300 }),
  );

  const text = await runner.run({
    source: `import hashlib
import signal
import subprocess
import sys
signal.pthread_sigmask(signal.SIG_BLOCK, {signal.SIGALRM})
subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)", "${marker}"])
hashlib.pbkdf2_hmac("sha256", b"password", b"salt", 2_000_000_000)
`,
    stdin: "",
  });

  expect(traceFrom(text).end).toEqual({ status: "timeout" });
  await expectProcessGone(marker);
});

test("an output flood is cut at a complete line and ends as truncated", async () => {
  const root = await tempRoot();
  const maxTraceBytes = 4_096;
  const runner = new SubprocessRunner(options(root, { maxTraceBytes }));

  const text = await runner.run({
    source: 'print("x" * 1_000_000)\n',
    stdin: "",
  });

  expect(traceFrom(text).end).toEqual({ status: "truncated" });
  expect(Buffer.byteLength(text)).toBeLessThanOrEqual(
    maxTraceBytes + Buffer.byteLength('{"op":"end","status":"truncated"}\n'),
  );
});

test("a runner that cannot start throws RunnerError and removes its temp directory", async () => {
  const root = await tempRoot();

  const runner = new SubprocessRunner(
    options(root, { pythonPath: join(root, "missing-python") }),
  );

  await expect(
    runner.run({ source: "print('never')\n", stdin: "" }),
  ).rejects.toBeInstanceOf(RunnerError);
  expect(await readdir(root)).toEqual([]);
});
