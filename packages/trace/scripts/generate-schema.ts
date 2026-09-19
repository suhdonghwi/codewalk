import { readFile, writeFile } from "node:fs/promises";

import { z } from "zod";

import { EventSchema, HeaderSchema } from "../src/schema.ts";

const outputUrl = new URL("../../../spec/trace.schema.json", import.meta.url);

const header = z.toJSONSchema(HeaderSchema);

const event = z.toJSONSchema(EventSchema);

delete header.$schema;

delete event.$schema;

const schema = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $defs: { header, event },
  oneOf: [{ $ref: "#/$defs/header" }, { $ref: "#/$defs/event" }],
};

const generated = `${JSON.stringify(schema, null, 2)}\n`;

if (process.argv.includes("--check")) {
  const checkedIn = await readFile(outputUrl, "utf8").catch(() => "");

  if (checkedIn !== generated) {
    console.error(
      "spec/trace.schema.json is out of date; run `mise run schema`",
    );

    process.exitCode = 1;
  }
} else {
  await writeFile(outputUrl, generated);
}
