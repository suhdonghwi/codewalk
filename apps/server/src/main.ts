import Fastify from "fastify";

import { TRACE_FORMAT_VERSION } from "@codewalk/trace";

const server = Fastify();

server.get("/api/health", () => ({
  ok: true,
  traceFormat: TRACE_FORMAT_VERSION,
}));

await server.listen({ host: "127.0.0.1", port: 3001 });
