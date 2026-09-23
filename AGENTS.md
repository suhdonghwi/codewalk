# Repository Instructions

- Do not write code comments. The only exception is the extremely rare case
  where the code needs a natural-language explanation that cannot be recovered
  from the code itself. Comments that describe or summarise what the code does
  must be removed.
- The web client is built with React Compiler. Do not add `useMemo`, `useCallback`
  or `memo` by default. Keep an explicit `useMemo` only around genuinely
  expensive work, because the compiler does not cache a value that is still used
  after a later hook call.
- `apps/web/src/ui/` holds shadcn/ui components. Keep them as the shadcn CLI
  generates them (`pnpm dlx shadcn@latest add <name> --overwrite` in
  `apps/web`), including variants, sizes and props nothing uses yet. Do not
  trim, restyle or refactor them, and leave them out of dead-code and
  simplification passes; adapt behaviour at the call sites instead. They use
  the `base-vega` style (Base UI primitives) and import `cn` from shadcn's `cn`
  package.
- Tests follow the `writing-tests` skill. The only golden contract is tracer
  output (`spec/fixtures/`, source → trace); there are no goldens or snapshots
  anywhere else. No end-to-end suite exists yet; when one is added, it may
  cover only these core journeys:
  1. Run a program → click a call site → the callee window opens.
  2. Click a loop → the sibling list opens → switch iteration.
  3. Click an output line → the path to its site opens.
  4. A run that raises → the path to the exception origin opens automatically.
  5. A syntax error is shown and no trace tree appears.
