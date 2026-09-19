import { describe, expect, test } from "vitest";

import { parseStoredState } from "./persistence.ts";

const expectedDefault = {
  source: `def fact(n):
    print("fact", n)
    if n <= 1:
        return 1
    return n * fact(n - 1)

for i in range(2):
    print(fact(i + 1))
`,
  stdin: "",
};

describe("parseStoredState", () => {
  test.each([
    { name: "malformed JSON", value: "{" },
    { name: "a schema-invalid object", value: '{"source": 4, "stdin": []}' },
  ])("falls back to the fixture source for $name", ({ value }) => {
    expect(parseStoredState(value)).toEqual(expectedDefault);
  });
});
