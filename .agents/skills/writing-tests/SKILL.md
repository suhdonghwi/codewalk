---
name: writing-tests
description: Criteria for deciding whether a test should exist and what it may assert. Use before writing, changing or reviewing tests in any language, to avoid meaningless or tautological tests and keep the suite minimal.
---

# Writing tests

A test earns its place only if a plausible bug would make it fail. Few sharp
tests beat many weak ones. There is no coverage target.

## Whether to test

- Test only real logic: code with branching, invariants, or a contract other
  code relies on (a parser, a layout function, a state reducer, a stack
  discipline).
- Glue, wiring, config and presentational UI get no test. Zero tests is a valid
  outcome — say so in your report.
- UI: no component or DOM tests. Move the logic into pure functions and test
  those. End-to-end tests exist only for the project's listed core journeys;
  never add one without the user's approval.

```ts
// No: tests the framework and a string literal.
render(<RunButton />); expect(screen.getByText("Run")).toBeInTheDocument();

// Yes: the decision the button depends on, extracted and tested as logic.
test("running is disabled while a run is in flight or the source is empty", …)
```

## Justification rule

Before writing a test, name the plausible bug it catches that no existing test
catches. If you cannot, or another test already catches it, do not write it (or
merge the two). The test name is a full sentence stating the behavior; the
reasoning goes in your report, not in code.

```
Name:    "an exception caught inside a function leaves no stale node on the stack"
Catches: stack repair skipped on the except path → later nodes attach to a dead parent.

Name:    "parses a valid event"
Catches: nothing specific → do not write it.
```

## Never write

- **UI text, markup, class name or snapshot comparisons.**
- **Re-tested guarantees** — what the type system, a schema, the linter or a
  library already enforces.
  `expect(() => Schema.parse({ id: "x" })).toThrow()` tests the schema library.
- **Restated implementation** — the expected value comes from the code's own
  formula, a constant equals itself, or the result is what the fake returned.
  `expect(area(w, h)).toBe(w * h)`; `expect(DEFAULT_LIMIT).toBe(1000)`.
  Use independently known values: `expect(area(3, 4)).toBe(12)`.
- **Existence/smoke assertions** — renders without crashing, is defined, does
  not throw, returns an array. Almost no real bug violates them.
- **Case inflation** — several inputs down the same path. One table-driven test
  per equivalence class; pick cases at boundaries, not more of the middle.
  `clamp`: below, inside, above, and `min == max` — not five "inside" values.
- **Call assertions** — `toHaveBeenCalledWith`, call counts. Assert the outcome
  the call was supposed to produce.

## Doubles

Real by default: real subprocess, real parser, real fixtures. Hand-written fakes
only for injected interfaces at slow, dangerous or nondeterministic edges
(sandbox, clock, network). No module mocking.

```ts
// Yes: fake at the edge, assert the outcome.
const runner = fakeRunner({ hangs: true });
expect((await run(src, { runner, timeoutMs: 10 })).status).toBe("timeout");

// No: expect(runner.kill).toHaveBeenCalledTimes(1);
```

## Goldens

Golden files only where the project designates a whole-output contract. Keep
each golden input minimal and about one thing. Never regenerate a golden to make
a test pass — explain every changed line in your report.

## Report

List the tests you added, each with the bug it catches; tests you modified or
deleted, each with why; and logic you deliberately left untested.
