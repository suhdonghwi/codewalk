import Fastify, { type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { z } from "zod";

import type { Runner } from "./runner.ts";

const RunRequestSchema = z
  .object({
    source: z.string().max(100_000),
    stdin: z.string().max(100_000),
  })
  .strict();

const HttpErrorSchema = z.object({ statusCode: z.number().int() });

export function buildApp(options: {
  runner: Runner;
  logger?: boolean;
}): FastifyInstance {
  const app = Fastify({
    bodyLimit: 512 * 1024,
    logger: options.logger ?? false,
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.setErrorHandler((error, request, reply) => {
    const httpError = HttpErrorSchema.safeParse(error);

    if (
      hasZodFastifySchemaValidationErrors(error) ||
      (httpError.success && httpError.data.statusCode === 400)
    ) {
      void reply.status(400).send({ error: "invalid_request" });

      return;
    }

    if (httpError.success && httpError.data.statusCode === 413) {
      void reply.send(error);

      return;
    }

    request.log.error(error);
    void reply.status(500).send({ error: "runner_failed" });
  });

  app.post(
    "/api/run",
    { schema: { body: RunRequestSchema } },
    async (request, reply) => {
      const trace = await options.runner.run(request.body);

      return reply.type("application/x-ndjson; charset=utf-8").send(trace);
    },
  );

  return app;
}
