import { defineConfig } from "oxlint";

const PADDING_LINES = [
  { blankLine: "always", prev: "import", next: "*" },
  {
    blankLine: "always",
    prev: "*",
    next: { selector: "Program > :not(ImportDeclaration)" },
  },
  {
    blankLine: "always",
    prev: { selector: "Program > :not(ImportDeclaration)" },
    next: "*",
  },
  {
    blankLine: "always",
    prev: "*",
    next: ["function", "class", "interface", "type"],
  },
  {
    blankLine: "always",
    prev: ["function", "class", "interface", "type"],
    next: "*",
  },
  {
    blankLine: "always",
    prev: "*",
    next: [
      "multiline-const",
      "multiline-let",
      "multiline-var",
      "multiline-using",
    ],
  },
  {
    blankLine: "always",
    prev: [
      "multiline-const",
      "multiline-let",
      "multiline-var",
      "multiline-using",
    ],
    next: "*",
  },
  {
    blankLine: "always",
    prev: "*",
    next: ["return", "if", "switch", "try", "for", "while", "do"],
  },
  { blankLine: "always", prev: "block-like", next: "*" },
  { blankLine: "any", prev: "import", next: "import" },
  {
    blankLine: "any",
    prev: {
      selector:
        ':matches(TSDeclareFunction, ExportNamedDeclaration[declaration.type="TSDeclareFunction"])',
    },
    next: {
      selector:
        ':matches(TSDeclareFunction, FunctionDeclaration, ExportNamedDeclaration[declaration.type="TSDeclareFunction"], ExportNamedDeclaration[declaration.type="FunctionDeclaration"])',
    },
  },
];

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
    { name: "stylistic", specifier: "@stylistic/eslint-plugin" },
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
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    "stylistic/padding-line-between-statements": ["error", ...PADDING_LINES],
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
