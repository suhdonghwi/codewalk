import { defineConfig } from "oxlint";

export default defineConfig({
  ignorePatterns: [
    ".agents/**",
    ".claude/**",
    "apps/web/src/ui/**",
    "tools/oxlint/anti-slop/**",
    "apps/tracer-python/**",
  ],
  categories: {
    correctness: "error",
  },
  plugins: ["unicorn"],
  jsPlugins: [
    { name: "anti-slop", specifier: "./tools/oxlint/anti-slop/index.ts" },
  ],
  rules: {
    "oxc/no-accumulating-spread": "error",
    "no-restricted-imports": [
      "error",
      {
        patterns: [
          {
            group: ["@/domain/*/**", "!@/domain/*/index.ts"],
            message: "Import domains through their index.ts public API.",
          },
        ],
      },
    ],
    "unicorn/filename-case": ["error", { case: "kebabCase" }],
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    "anti-slop/no-runtime-typeof": "error",
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-readable-spacing": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
  },
  overrides: [
    {
      files: ["apps/web/src/domain/*/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/domain/*/**", "!@/domain/*/index.ts"],
                message: "Import domains through their index.ts public API.",
              },
              {
                group: ["../**"],
                message: "Do not use relative imports that leave a domain.",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["apps/web/src/domain/*/*/*.{ts,tsx}"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/domain/*/**", "!@/domain/*/index.ts"],
                message: "Import domains through their index.ts public API.",
              },
              {
                group: ["../../**"],
                message: "Do not use relative imports that leave a domain.",
              },
            ],
          },
        ],
      },
    },
  ],
});
