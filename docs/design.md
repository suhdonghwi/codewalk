# codewalk — design

codewalk is a code execution visualizer. You write a program, run it, and then
freely navigate _what happened_ as a structure in space — call by call,
iteration by iteration — instead of stepping through it in time.

## Problem

When people write a program or solve an algorithm problem they cannot see what
the code does while it runs.

- **Debuggers** need breakpoints in the right places, endless step-step-step,
  and a restart whenever you step past the interesting point.
- **Debug prints** are flat lines of text; you have to infer when and where each
  line was produced.

codewalk records the whole run up front and shows it in the natural structure of
execution. You start from a window showing the entry file, click the range where
a call happened, and a window for that call opens next to it — recursively.
Loops unroll into iterations. Output is shown inline at the line that produced
it, so debug prints carry their context.

## Principles

1. **One UI language.** No special-case widgets. Everything is: _a window shows
   one execution of a source range; ranges in it that spawned child executions
   are clickable; clicking opens the child windows._ Calls, loops, callbacks and
   navigation jumps all use this. Convenience abstractions (tables, scrubbers,
   abbreviation of repetition) come later, once real repetition patterns show up.
2. **Language-agnostic trace.** The tracer is per-language; the trace format and
   the viewer are not. The viewer only knows source ranges and three roles.
3. **Degrade gracefully.** Anything the tracer does not understand behaves as an
   opaque expression: it runs correctly, its output is attributed to the line
   that caused it, and it simply is not expandable.
4. **v1 audience: learners and algorithm solvers.** Single file, small inputs,
   Python. Hard limits instead of scalability machinery.

## Architecture

```
 web (React)                server (Fastify)              sandbox (one process)
 ┌──────────────┐  POST /run  ┌─────────────┐   runner   ┌────────────────────┐
 │ editor       │ ──────────▶ │ validate    │ ─────────▶ │ python -m codewalk │
 │ stdin        │  {source,   │ queue, limit│  source,   │  instrument (ast)  │
 │ trace tree   │ ◀────────── │ cap, relay  │ ◀───────── │  + run with runtime│
 │ output       │ trace.jsonl └─────────────┘ trace.jsonl└────────────────────┘
 └──────────────┘
```

The server contains no Python. Instrumenting and running both happen inside the
sandboxed process, so hostile source never reaches a parser outside the jail.

| Dir                   | What                                                                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec/`               | [Trace format](../spec/trace-format.md), generated `trace.schema.json`, fixtures. The contract between tracer and viewer.                               |
| `apps/tracer-python/` | Python (uv), import name `codewalk`: `ast` instrumenter, runtime (event writer, stdout hook, limits), CLI `python -m codewalk run foo.py`. Stdlib only. |
| `packages/trace/`     | TypeScript: Zod schemas for the trace format, JSONL parser, tree builder, derived views. Shared by `apps/web/` and `apps/server/`.                      |
| `apps/server/`        | TypeScript, Fastify. `POST /run {source, stdin}` → trace (JSONL). Pluggable runner.                                                                     |
| `apps/web/`           | React + TypeScript + Vite. Canvas, windows, editor, trace viewer.                                                                                       |

## Trace model

Specified in [`spec/trace-format.md`](../spec/trace-format.md). In short: a tree
of nodes, each one execution of a source range, with three roles.

- **block** — a module run, function activation or loop iteration → a window.
- **stmt** — a statement that ran in its block; always recorded → lit vs. dimmed.
- **expr** — an expression; recorded only if something happened inside it.

A **site** is a stmt/expr node that directly contains blocks (→ clickable range)
or output (→ inline output). A call and a loop are the same thing to the viewer;
so are a function activation and an iteration.

v1 records **no values** — only structure, statement coverage, output and
exceptions.

## Tracer (Python)

Source-to-source `ast` transform plus a small runtime. Hybrid of two ideas:
in-place brackets for expressions and statements (semantics-preserving, general),
explicit blocks for functions and iterations (reliable structure).

```python
def fact(n):
    with _cw.block(2):                                  # function activation
        _cw.stmt(3); _cw_e(_cw_b(4), print("fact", n))
        _cw.stmt(5)
        if _cw_e(_cw_b(6), n <= 1):
            _cw.stmt(7); return 1
        _cw.stmt(8); return _cw_e(_cw_b(9), n * _cw_e(_cw_b(10), fact(_cw_e(_cw_b(11), n - 1))))

_cw.stmt(12)                                            # loop statement stays open …
for i in _cw_e(_cw_b(13), range(2)):
    with _cw.iteration(14):                             # … and contains the iterations
        _cw.stmt(15); _cw_e(_cw_b(16), print(_cw_e(_cw_b(17), fact(_cw_e(_cw_b(18), i + 1)))))
```

- **Injected names.** `_cw` (the runtime), `_cw_b`, `_cw_e` — prefixed so that a
  learner's own `_e = 1e-9` cannot break the run.
- **Expressions: in-place brackets.** `_cw_e(_cw_b(id), <expr>)` — argument order
  guarantees begin → evaluate → end, and the expression is still evaluated in
  the user's own frame. No wrapper frame, so zero-arg `super()`, `locals()`,
  frame inspection, recursion depth and tracebacks are unaffected.
- **Selective bracketing.** Bracket expressions that can run code: `Call`,
  binary/unary operators, `Compare`, `Attribute`, `Subscript`, `Await`. Skip
  `Name`/`Constant` leaves — without value capture they carry no information.
  Widening this set later changes neither the format nor the viewer.
- **Statements: a point marker.** `_cw.stmt(id)` before each statement. It needs
  no end marker: the next sibling's marker (or the block's exit) closes it.
  Compound statements are header-only; their body statements are siblings.
- **Blocks: explicit and reliable.** `with _cw.block(id)` around module and
  function bodies, `with _cw.iteration(id)` around loop bodies (equivalent to
  `try/finally`; adds no frame). Exit is
  guaranteed on `return`, `break`, `continue` and exceptions, and sees the
  propagating exception for `exit.exc`.
- **Stack repair.** The runtime keeps a stack of open nodes. `_cw_e` never runs when
  an expression raises, so the stack can go stale. Every loc has a static
  `parent`; on `stmt(id)`, `_cw_b(id)` and iteration-block entry the runtime pops
  until the top is that parent. Function-block entry does no repair (its dynamic
  parent is whatever is open). Block exit pops down to the block. Repair never
  pops a block — if it would have to, something is wrong and it stops.
- **Lazy emission.** `_cw_b` pushes a _pending_ node and writes nothing. The first
  thing that happens inside it (output, block entry) writes the pending chain's
  `enter` events first. A pending node that closes untouched is dropped. So the
  trace contains only meaningful expr nodes, however much is bracketed; the
  remaining cost is CPU only.
- **Statement fallback.** A block entered with no open expr attaches to the
  current statement: `for` → `__next__`, `with` → `__enter__`, `a[i] = v` →
  `__setitem__`, `a += b` → `__iadd__`. That statement becomes the site.
- **Output.** `sys.stdout`/`sys.stderr` are replaced by writers that emit `out`
  events on the innermost open node. This catches output from library code too
  and attributes it to the user expression that caused it.
- **stdin** is fed from the request; `input()` is an ordinary call site.
- **Limits.** After N events the runtime writes `end: truncated` and stops
  recording (the program may be killed).

Python construct mapping:

| Construct                                                        | v1 treatment                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `def` (incl. nested, methods)                                    | `def` header is a stmt in the defining block; body is a `function` block.                                                                                                                                                                                                                    |
| `for` / `while`                                                  | Header is a `loop` stmt that stays open; each pass through the body is an `iteration` block. A `for` iterable and a `while` condition belong to the loop stmt (parent window), not to the iteration.                                                                                         |
| `if`/`with`/`try`/`class`                                        | Header-only stmt; body statements are siblings in the enclosing block.                                                                                                                                                                                                                       |
| Comprehensions                                                   | No iteration blocks; expressions inside are bracketed, so calls inside still expand (same loc entered N times → one merged stack).                                                                                                                                                           |
| Lambdas, generator expressions, generator functions, `async def` | Body left uninstrumented: these run later or re-entrantly, when their static parent is no longer on the stack (repair would unwind the consumer's open nodes), and generator/coroutine activations do not nest. They run normally, output is attributed to the calling site, not expandable. |
| Builtins / library calls                                         | Opaque: a call expr with output and no blocks (`print(...)` is exactly this).                                                                                                                                                                                                                |
| Threads                                                          | Unsupported; single stack assumed.                                                                                                                                                                                                                                                           |

Expected slowdown is roughly 5–20×; time limits account for it. Instrumentation
preserves line numbers (`ast.copy_location`) and `_cw` frames are filtered out of
user-facing tracebacks.

Testing: golden files — source in, expected trace out — plus an invariant
checker (proper nesting, role nesting rules, program output == concatenated
`out` events == output of the uninstrumented program). Every produced trace is
also validated against `spec/trace.schema.json`.

## Viewer

### Canvas

Hand-made infinite canvas (pan/zoom) and window components — no React Flow; the
layout and interaction logic is too custom.

Movable objects on the canvas: the **editor** window, the **stdin** window, the
**output** window, and the **trace tree** (dragged by its root window). Windows
_inside_ the trace tree are not individually draggable: the tree is laid out
automatically and moves as one rigid unit, so users cannot wreck its shape.

Default placement: editor top-left, stdin below it, output below stdin; the
trace root to the right of the editor, growing rightwards.

### Windows

- **Editor** — CodeMirror 6, Python. A Run button sends source + stdin.
- **stdin** — plain text fed to the program.
- **Output** — concatenated `out` events (stderr styled differently), followed by
  the traceback / truncation / timeout notice. Every chunk is clickable
  (reverse navigation).
- **Trace window** — custom read-only React component, _not_ CodeMirror. Renders
  the block's source range from the trace's own `sources`, highlighted with the
  same engine as the editor: Lezer (`@lezer/python` + `@lezer/highlight`) with
  the shared `HighlightStyle`. Tokens are split at loc boundaries so highlight
  spans and interactive ranges are one flat span list. Shows:
  - lit / dimmed / inert statements (see spec, "Statement state");
  - clickable ranges for sites that contain blocks;
  - inline output at the end of the line of sites that contain output;
  - the exception marker on the origin statement.
    Title bar: kind + name (`function fact`, `iteration 3`), has-output marker.
    A window is either expanded or collapsed to its title bar.

Running replaces the previous trace (the tree keeps its position).

### View state = one path

Only one sibling is expanded at a time, across the whole tree. The entire trace
view is derived from

```
path: NodeId[]      // expanded block windows, root → deepest
```

- Column _k_ of the tree holds the child stack of the site selected in column
  _k−1_: all child blocks as title bars, one of them expanded. (Finder column
  view, on a canvas.) The expanded child is vertically aligned to the clicked
  range where possible; an edge connects range → stack.
- **Click a site** → truncate `path` at that window, append the site's first
  child. **Click a title bar** in a stack → replace that column's entry.
- **Reverse navigation** (click output) and **exception auto-open** (on a failed
  run) are both just `path = pathTo(node)`, plus a highlight on the target site.
- `path` is serializable (URL → "look at this exact moment").

## Server and sandbox

`POST /run {source, stdin}` → run `python -m codewalk run` in the sandbox →
JSONL trace. Syntax errors return a header plus `end: syntax_error`. No
streaming in v1.

The sandboxed process gets the source as a file in its workdir, the request's
stdin on fd 0, and writes the trace to a dedicated fd (not stdout — the program's
own raw writes to fd 1/2 must not corrupt the trace). The server relays the
trace, capping its size, and appends `end: timeout` if the process was killed.

Runner interface (injected, so tests use a fake runner rather than module mocks)
with two implementations:

- `SubprocessRunner` — dev only. Subprocess with timeout.
- `NsjailRunner` — production (public hosting). nsjail: no network namespace
  interfaces, read-only bind-mounted minimal rootfs with Python, small tmpfs
  workdir, cgroup memory (~256 MB) and pids limits, CPU and wall time limits,
  unprivileged user, seccomp policy. The server caps trace bytes read; the
  runtime caps events written.

Around it: rate limiting and a small concurrency queue. nsjail needs real kernel
access, so host on a VM (e.g. EC2), not a gVisor/PaaS container. The box holds no
secrets and is disposable.

**The trace is untrusted input.** User code shares a process with the tracer
runtime and can forge events. The viewer validates the schema, caps sizes, and
never renders trace content as HTML.

## Tech stack

**Repo.** One repo, two ecosystems. **mise** pins Node, pnpm, Python and uv and
is the single task runner (`mise run dev`, `mise run check`); CI runs
`mise run check`. **pnpm** workspaces: `apps/web/`, `apps/server/`,
`packages/trace/`. `apps/tracer-python/` is a **uv** project next to them; tracers
for other languages become `apps/tracer-<language>/`.

**TypeScript (all packages).**

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`.
- **oxlint**, type-aware mode on, plus the vendored
  [anti-slop](https://github.com/dmmulroy/anti-slop) plugin (generic rules only,
  no Effect rules). Its stance — parse at boundaries, no runtime `typeof`, no
  unsafe assertions, no module mocking — is the house style.
- **Zod 4** for every boundary: the trace (untrusted) in `packages/trace`, the
  HTTP API via `fastify-type-provider-zod`. `spec/trace.schema.json` is generated
  from the Zod schemas and checked in; the Python tests validate against it, so
  the contract is enforced from both sides.
- **ts-pattern** for branching on the format's discriminated unions (`op`,
  `role`, `end.status`), always `.exhaustive()`.
- **Prettier** (also formats md/json/css), **knip** for unused
  files/exports/dependencies, **Vitest** for tests, Playwright for end-to-end
  from M3.

**web.** Vite, React 19, Tailwind v4 + **shadcn** for chrome only (title bars,
buttons, toolbar, toasts, dialogs, menus) — never inside the trace window body.
**Zustand** for state: the canvas transform is read via transient subscription
and written straight to a CSS transform, so pan/zoom does not re-render React;
`path` and window positions are ordinary store state. `codemirror` +
`@codemirror/lang-python` for the editor; `@lezer/python` + `@lezer/highlight`
with the same `HighlightStyle` for trace windows. No canvas, gesture or layout
library.

**server.** Node 24 running TypeScript directly (type stripping; `tsc --noEmit`
is only a check), **Fastify**, `@fastify/rate-limit` and an in-process semaphore
for the run queue (M5). In dev, Vite proxies `/api` to it.

**tracer.** One pinned Python minor version everywhere (dev, CI, sandbox rootfs)
— `ast` node shapes differ between minors. Runtime dependencies: none (stdlib
only; it runs inside the jail's minimal rootfs). Dev: **ruff** (lint + format),
**ty** (type check), **pytest**, `jsonschema` for validating traces against the
spec.

## Testing

Follow the `writing-tests` skill. Project-specific designations it refers to:

- **Golden contract:** tracer output only (`spec/fixtures/`, source → trace).
  No goldens or snapshots anywhere else.
- **Core end-to-end journeys** (the complete list):
  1. Run a program → click a call site → the callee window opens.
  2. Click a loop → iteration stack opens → switch iteration.
  3. Click an output line → the path to its site opens.
  4. A run that raises → the path to the exception origin opens automatically.
  5. A syntax error is shown and no trace tree appears.

## Milestones

- **M0 — Spec.** Trace format, fixtures. _(this document + `spec/`)_
- **M1 — Tracer.** Instrumenter, runtime, CLI, golden tests, invariant checker.
- **M2 — Viewer core** (parallel with M1, against fixtures). Canvas, window
  component, trace window (highlighting, statement states, clickable sites,
  inline output), path-driven column layout.
- **M3 — End to end.** Server + `SubprocessRunner`, editor, Run, stdin, output
  window, replace-on-rerun, syntax errors.
- **M4 — Navigation.** Reverse navigation, exception auto-open, has-output
  markers, edges, alignment, transitions, path in URL.
- **M5 — Production.** `NsjailRunner`, limits, rate limiting, deployment.

## Deferred

- Values: call arguments in window titles first, then expression values
  (`_cw_e` already sees them), then variable/heap state.
- Instrumenting lambdas, generator expressions, generators, `async`; iteration
  blocks for comprehensions.
- Convenience views over repetition (iteration tables, scrubbers, abbreviation).
- Skeleton-first recording with on-demand deterministic re-execution for large
  runs; compact event encoding.
- Multi-file programs, more languages (the second language is the real test of
  the format).
- Keeping several traces side by side.
