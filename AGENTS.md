# Repository Instructions

- Do not write code comments. The only exception is the extremely rare case
  where the code needs a natural-language explanation that cannot be recovered
  from the code itself. Comments that describe or summarise what the code does
  must be removed.
- The web client is built with React Compiler. Do not add `useMemo`, `useCallback`
  or `memo` by default. Keep an explicit `useMemo` only around genuinely
  expensive work, because the compiler does not cache a value that is still used
  after a later hook call.
