import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "tools/oxlint/anti-slop/**"],
    include: ["**/*.test.ts"],
  },
});
