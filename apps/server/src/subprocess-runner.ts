import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { RunnerError, type RunRequest, type Runner } from "./runner.ts";

const STDERR_LIMIT = 8 * 1024;

const TRUNCATED_END = '{"op":"end","status":"truncated"}\n';

const TIMEOUT_END = '{"op":"end","status":"timeout"}\n';

const HeaderSchema = z.object({ codewalk: z.literal(1) });

const EndSchema = z.object({
  op: z.literal("end"),
  status: z.enum(["ok", "exception", "truncated", "timeout", "syntax_error"]),
});

export interface SubprocessRunnerOptions {
  pythonPath: string;
  timeLimit: number;
  maxTraceBytes: number;
  tempRoot?: string;
}

function killProcessGroup(pid: number | undefined): void {
  if (pid === undefined) return;

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    // The process group may already have exited between the check and signal.
  }
}

function hasHeader(trace: string): boolean {
  const newline = trace.indexOf("\n");

  if (newline < 0) return false;

  try {
    return HeaderSchema.safeParse(JSON.parse(trace.slice(0, newline))).success;
  } catch {
    return false;
  }
}

function hasEnd(trace: string): boolean {
  const lines = trace.split("\n");
  const lastLine = lines.at(-2);

  if (lastLine === undefined) return false;

  try {
    return EndSchema.safeParse(JSON.parse(lastLine)).success;
  } catch {
    return false;
  }
}

function completeLines(bytes: Buffer): string {
  const decoded = bytes.toString("utf8");
  const newline = decoded.lastIndexOf("\n");

  return newline < 0 ? "" : decoded.slice(0, newline + 1);
}

export class SubprocessRunner implements Runner {
  readonly #options: SubprocessRunnerOptions;

  constructor(options: SubprocessRunnerOptions) {
    this.#options = options;
  }

  async run(request: RunRequest): Promise<string> {
    const directory = await mkdtemp(
      join(this.#options.tempRoot ?? tmpdir(), "codewalk-run-"),
    );

    let childPid: number | undefined;

    try {
      await writeFile(join(directory, "main.py"), request.source, "utf8");

      const child = spawn(
        this.#options.pythonPath,
        ["-I", "-m", "codewalk", "run", "main.py", "--trace-fd", "3"],
        {
          cwd: directory,
          detached: true,
          env: {
            PATH: process.env.PATH,
            LANG: "C.UTF-8",
            PYTHONUTF8: "1",
            PYTHONDONTWRITEBYTECODE: "1",
            HOME: directory,
          },
          stdio: ["pipe", "ignore", "pipe", "pipe"],
        },
      );

      childPid = child.pid;

      const childStdin = child.stdin;
      const childStderr = child.stderr;
      const traceStream = child.stdio[3];

      if (
        childStdin === null ||
        childStderr === null ||
        traceStream === null ||
        traceStream === undefined
      ) {
        throw new RunnerError("Tracer pipes were not created");
      }

      const traceChunks: Buffer[] = [];
      let traceBytes = 0;
      let traceExceeded = false;
      let stderrTail = Buffer.alloc(0);
      let spawnError: Error | null = null;

      const closed = new Promise<void>((resolve) => {
        child.once("error", (error) => {
          spawnError = error;
        });
        child.once("close", () => resolve());
      });

      childStderr.on("data", (chunk: Buffer) => {
        stderrTail = Buffer.concat([stderrTail, chunk]).subarray(-STDERR_LIMIT);
      });
      traceStream.on("data", (chunk: Buffer) => {
        if (traceExceeded) return;

        const remaining = this.#options.maxTraceBytes - traceBytes;

        if (chunk.length <= remaining) {
          traceChunks.push(chunk);
          traceBytes += chunk.length;

          return;
        }

        if (remaining > 0) traceChunks.push(chunk.subarray(0, remaining));
        traceBytes += remaining;
        traceExceeded = true;
        killProcessGroup(child.pid);
      });

      childStdin.on("error", () => undefined);
      childStdin.end(request.stdin);

      const timeout = setTimeout(
        () => killProcessGroup(child.pid),
        this.#options.timeLimit * 1_000,
      );

      try {
        await closed;
      } finally {
        clearTimeout(timeout);
      }

      const stderr = stderrTail.toString("utf8");
      const trace = completeLines(Buffer.concat(traceChunks, traceBytes));

      if (!hasHeader(trace)) {
        console.error("Tracer failed before producing a header", {
          error: spawnError,
          exitCode: child.exitCode,
          signal: child.signalCode,
          stderr,
        });
        throw new RunnerError("Tracer did not produce a trace", {
          cause: spawnError ?? undefined,
        });
      }

      if (traceExceeded) return trace + TRUNCATED_END;

      return hasEnd(trace) ? trace : trace + TIMEOUT_END;
    } finally {
      killProcessGroup(childPid);
      await rm(directory, { recursive: true, force: true });
    }
  }
}
