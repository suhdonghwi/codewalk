import { fileURLToPath } from "node:url";

import { buildApp } from "./app.ts";
import { SubprocessRunner } from "./subprocess-runner.ts";

const runner = new SubprocessRunner({
  pythonPath: fileURLToPath(
    new URL("../../tracer-python/.venv/bin/python", import.meta.url),
  ),
  timeLimit: 5,
  maxTraceBytes: 4 * 1024 * 1024,
});

const app = buildApp({ runner, logger: true });

await app.listen({ host: "127.0.0.1", port: 3001 });
