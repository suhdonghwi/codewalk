import { fileURLToPath } from "node:url";

import { z } from "zod";

const DEFAULT_PYTHON = fileURLToPath(
  new URL("../../tracer-python/.venv/bin/python", import.meta.url),
);

const EnvironmentSchema = z.object({
  HOST: z.string().min(1).default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3001),
  CODEWALK_PYTHON: z.string().min(1).default(DEFAULT_PYTHON),
  CODEWALK_TIME_LIMIT: z.coerce.number().positive().default(5),
  CODEWALK_MAX_TRACE_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(4_194_304),
  CODEWALK_ALLOW_UNSANDBOXED: z.string().optional(),
});

function isLoopback(host: string): boolean {
  return (
    host === "localhost" ||
    host === "::1" ||
    host === "[::1]" ||
    /^127(?:\.[0-9]{1,3}){3}$/.test(host)
  );
}

export interface Config {
  host: string;
  port: number;
  pythonPath: string;
  timeLimit: number;
  maxTraceBytes: number;
}

export function readConfig(
  environment: NodeJS.ProcessEnv = process.env,
): Config {
  const parsed = EnvironmentSchema.parse(environment);

  if (!isLoopback(parsed.HOST) && parsed.CODEWALK_ALLOW_UNSANDBOXED !== "1") {
    throw new Error(
      "Refusing to start the unsandboxed runner on a non-loopback host; set CODEWALK_ALLOW_UNSANDBOXED=1 to override",
    );
  }

  return {
    host: parsed.HOST,
    port: parsed.PORT,
    pythonPath: parsed.CODEWALK_PYTHON,
    timeLimit: parsed.CODEWALK_TIME_LIMIT,
    maxTraceBytes: parsed.CODEWALK_MAX_TRACE_BYTES,
  };
}
