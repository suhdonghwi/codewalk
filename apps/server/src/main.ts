import { buildApp } from "./app.ts";
import { readConfig } from "./config.ts";
import { SubprocessRunner } from "./subprocess-runner.ts";

const config = readConfig();

const runner = new SubprocessRunner({
  pythonPath: config.pythonPath,
  timeLimit: config.timeLimit,
  maxEvents: config.maxEvents,
  maxTraceBytes: config.maxTraceBytes,
  killGraceMs: config.killGraceMs,
});

const app = buildApp({ runner, logger: true });

await app.listen({ host: config.host, port: config.port });
