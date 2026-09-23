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
   navigation jumps all use this. The sibling list reads as a table of the
   siblings' entry values; further views over repetition (scrubbers,
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

| Dir                   | What                                                                                                                                                             |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `spec/`               | [Trace format](../spec/trace-format.md), generated `trace.schema.json`, fixtures. The contract between tracer and viewer.                                        |
| `apps/tracer-python/` | Python (uv), import name `codewalk`: `ast` instrumenter, runtime (event writer, stdout hook), CLI `python -m codewalk run foo.py`. Stdlib only.                  |
| `packages/trace/`     | TypeScript: Zod schemas for the trace format, JSONL parser, tree builder. Shared by `apps/web/` and `apps/server/`; the viewer derives its views in `apps/web/`. |
| `apps/server/`        | TypeScript, Fastify. `POST /run {source, stdin}` → trace (JSONL). Pluggable runner.                                                                              |
| `apps/web/`           | React + TypeScript + Vite. Canvas, windows, editor, trace viewer.                                                                                                |

## Trace model

Specified in [`spec/trace-format.md`](../spec/trace-format.md). In short: a tree
of nodes, each one execution of a source range, with three roles.

- **block** — a module run, function activation or loop iteration → a window.
- **stmt** — a statement that ran in its block; always recorded → lit vs. dimmed.
- **expr** — an expression; recorded only if something happened inside it.

A **site** is a stmt/expr node that directly contains blocks (→ clickable range)
or output (→ inline output). A call and a loop are the same thing to the viewer;
so are a function activation and an iteration.

v1 records structure, statement coverage, output and exceptions. It also
records block inputs — function parameters, loop targets and loop state — at
block entry, and in every block the value each statement gave to the variables
it assigned or changed.

## Tracer (Python)

Source-to-source `ast` transform plus a small runtime. Hybrid of two ideas:
in-place brackets for expressions and statements (semantics-preserving, general),
explicit blocks for functions and iterations (reliable structure).

```python
def fact(n):
    with _cw.block(2):
        _cw.value(3, n)
        _cw.stmt(4); _cw_e(_cw_b(5), print("fact", n))
        _cw.stmt(6)
        if _cw_e(_cw_b(7), n <= 1):
            _cw.stmt(8); return 1
        _cw.stmt(9); return _cw_e(_cw_b(10), n * _cw_e(_cw_b(11), fact(_cw_e(_cw_b(12), n - 1))))

_cw.stmt(13)
for i in _cw_e(_cw_b(15), range(2)):
    with _cw.iteration(16):
        _cw.value(14, i)
        _cw.stmt(17); _cw_e(_cw_b(18), print(_cw_e(_cw_b(19), fact(_cw_e(_cw_b(20), i + 1)))))
```

- **Injected names.** `_cw` (the runtime), `_cw_b`, `_cw_e` — prefixed so that a
  learner's own `_e = 1e-9` cannot break the run.
- **Expressions: in-place brackets.** `_cw_e(_cw_b(id), <expr>)` — argument order
  guarantees begin → evaluate → end, and the expression is still evaluated in
  the user's own frame. No wrapper frame, so zero-arg `super()`, `locals()`,
  frame inspection, recursion depth and tracebacks are unaffected.
- **Selective bracketing.** Bracket expressions that can run code: `Call`,
  binary/unary operators, `Compare`, `Attribute`, `Subscript`, `Await`. Skip
  `Name`/`Constant` leaves — on their own they carry no structural information.
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
  thing that happens inside it (output or block entry) writes the pending chain's
  `enter` events first. A pending node that closes untouched is dropped. So the
  trace contains only meaningful expr nodes, however much is bracketed; the
  remaining cost is CPU only.
- **Statement fallback.** A block entered with no open expr attaches to the
  current statement: `for` → `__next__`, `with` → `__enter__`, `a[i] = v` →
  `__setitem__`, `a += b` → `__iadd__`. That statement becomes the site.
- **Output.** `sys.stdout`/`sys.stderr` are replaced by writers that emit `out`
  events on the innermost open node. This catches output from library code too
  and attributes it to the user expression that caused it.
- **Values.** `_cw.value(id, name)` opens a function or iteration block, once
  per parameter or loop target; `_cw.state(id)` then records the iteration's
  loop state (see below). Values use a one-line `repr` of at most 48
  characters, the length an inline chip shows. Recording and output capture
  are muted while formatting so an instrumented user `__repr__` cannot change
  the trace. Objects without a custom `__repr__` render as `<ClassName>`,
  including inside containers, and memory addresses are dropped from built-in
  reprs (`<function <lambda>>`) so traces stay deterministic.
- **Loop state.** An iteration's inputs beyond its targets are the variables it
  may read before assigning them: a definite-assignment walk over the body (for
  `while`, the condition first) that intersects at branch joins and drops paths
  that `break`, `continue`, `return` or `raise`. Only names the enclosing scopes
  bind as variables count, so builtins, functions, classes and imports are not
  state. Mutation needs no special case: a list the body appends to is read
  before it is assigned, and its value differs between iterations. A variable
  not bound yet (typically in the first iteration) is left out.
- **Changes.** Every block watches variables: an iteration its loop state and
  every name its body assigns, a function call its parameters and locals, the
  module its globals. The instrumenter hands the runtime two static tables:
  per block loc, its inputs and watched names; per statement loc, the names
  the statement binds itself and, for a `for`, its targets, which that
  statement does not report. `_cw.state(id)` reads the watched names from the caller's frame
  (`f_locals`, then `f_globals`), emits the inputs and remembers each rendering.
  At every statement boundary in that iteration, and at its exit, the runtime
  renders the watched names again and emits a named value on the statement
  that just ran for each name it binds or whose rendering changed. So
  `mid = (lo + hi) // 2` is recorded even when it repeats last iteration's
  value, and `remember(seen, w)` is recorded because `seen` rendered differently after
  it. Statements of a called function belong to that function's block and are
  not settled against the iteration. A loop is one statement of its parent
  block, so what the parent records on it is the loop's end state. Only the
  first 1000 calls of each function watch their variables, so heavy
  recursion does not spend its time limit on renderings.
- **stdin** is fed from the request; `input()` is an ordinary call site.
- **Limits** belong to the runner, not the tracer. The runner kills the process
  at its time limit or once the trace reaches its byte cap. The tracer flushes
  the trace on a timer, so what it recorded before the kill survives, and the
  nodes that were open stay open.

Python construct mapping:

| Construct                                                        | v1 treatment                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `def` (incl. nested, methods)                                    | `def` header is a stmt in the defining block; body is a `function` block.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `for` / `while`                                                  | Header is a `loop` stmt that stays open and contains the `iteration` blocks. A `for` iterable is evaluated once and belongs to the loop stmt (parent window). A `while` condition is evaluated per pass and belongs to the iteration: `while t: body` is rewritten to `while True:` whose iteration block runs a `test` stmt (the header range), leaves on a false test, then runs the body. The final failed check is therefore an iteration of its own with a dimmed body. `while`/`else` keeps its meaning through a flag held by the runtime. |
| `if`/`with`/`try`/`class`                                        | Header-only stmt; body statements are siblings in the enclosing block.                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Comprehensions                                                   | No iteration blocks; expressions inside are bracketed, so calls inside still expand (same loc entered N times → one merged stack).                                                                                                                                                                                                                                                                                                                                                                                                                |
| Lambdas, generator expressions, generator functions, `async def` | Body left uninstrumented: these run later or re-entrantly, when their static parent is no longer on the stack (repair would unwind the consumer's open nodes), and generator/coroutine activations do not nest. They run normally, output is attributed to the calling site, not expandable.                                                                                                                                                                                                                                                      |
| Builtins / library calls                                         | Opaque: a call expr with output and no blocks (`print(...)` is exactly this).                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Threads                                                          | Unsupported; single stack assumed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

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
layout and interaction logic is too custom. A wheel over content that
scrolls (editor, sibling list) belongs to that content, also once it has reached
its end; only a wheel over nothing scrollable pans.

Movable objects on the canvas: the **editor** window, the **stdin** window, the
**output** window, and the **trace tree** (dragged by its root window). Windows
_inside_ the trace tree are not individually draggable: the tree is laid out
automatically and moves as one rigid unit, so users cannot wreck its shape.

Default placement: editor at the origin; stdin and output in a column to its
left (the editor grows downward with its content, so nothing sits below it); the
trace root to the right of the editor, growing rightwards. While the trace tree
is still at its default spot it stays docked to the editor's right edge.

Every window resizes from its right edge, bottom edge and corner (invisible
handles) and scrolls inside once its content no longer fits. The editor, stdin
and output windows always have a fixed size. Windows in the trace tree size to
their content until resized, and are resized **per column**: a column's trace
window and its sibling list each keep their width and height while the column
shows a different sibling or site, and the layout follows the new sizes.
Double-clicking a handle returns that axis to fitting the content. When a
resized window scrolls, its child column stays attached to the clicked line,
held at the window's top or bottom edge once the line scrolls out of view.

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
  - statement state (see spec, "Statement state"): lit at full strength; inert
    (runs in a child window) faded but still syntax-coloured; dimmed (did not
    run) faded and grey;
  - clickable ranges for sites that contain blocks;
  - inline output as a tinted chip on the line whose sites contain output; long
    or multi-line output expands into a panel below it;
  - values as chips of the same shape in the value colour, inserted in the
    code right after the name they belong to, reading `= 3`: a parameter's
    value follows its name on the `def` line, a loop target's value follows
    its name on the `for` line. Loop state is bound nowhere in the window, so
    its values are a group of chips on the loop's first line, the iteration's
    inputs. A value that is the same in every sibling is faded there, the way
    the title and sibling table leave it out. Only the window's own block contributes values, so a `for` line in
    the parent window carries none. Values are already short, so their chips
    never expand;
  - the exception on the origin statement: the line is faintly tinted, its line
    number turns red, and the one-line summary is a chip of the same shape as
    inline output, in the exception colour.

  Chips are one primitive with three tints: value, output and exception. A
  chip about a name sits immediately after the name, where it is bound. A chip
  about a whole line — output, the exception, loop state, and the changes a
  statement made (`lo → 8`) — sits in a column to
  the right of the code: the window body is a grid whose first column is as
  wide as the longest line, so these chips line up and read top to bottom as
  the block's data beside its code. Hovering a line with chips highlights the
  whole row.

  Title bar: the trace's `title`, with ` N` appended by the viewer when the site
  ran several blocks (a callback, a call in a comprehension). Iteration windows
  therefore read `iteration 2`. The block's entry values follow in parentheses
  (`fact 2 (n = 3)`, `iteration 3 (lo = 5, hi = 6)`). When the site ran
  several blocks, only the values that differ between them are listed, so
  constant inputs such as the array a search runs over drop out. A red dot
  marks a block that was left by an exception; it is the only title indicator,
  output is not marked. A window is either expanded or collapsed to its title
  bar.

Running replaces the previous trace (the tree keeps its position).

### View state = one path

Only one sibling is expanded at a time, across the whole tree. The entire trace
view is derived from

```
path: NodeId[]      // expanded block windows, root → deepest
```

- Column _k_ of the tree holds the children of the site selected in column
  _k−1_: the expanded child window, preceded — when the site has several child
  blocks — by a **sibling list** of all of them with the expanded one
  highlighted. (Finder column view, on a canvas.) The list is a table: a row
  per sibling (its indexed title and red dot) and a column per entry value
  that differs between siblings, with an empty cell where a sibling has none
  (a loop-state variable not bound yet). Reading down a column shows how the
  state moves from one iteration to the next; a value that repeats the row
  above it is faded, so the rows where a variable changes stand out. When the
  last sibling changed its loop state, an `after` row closes the table with the
  end state: the last sibling's inputs with its statements' changes applied.
  It has cells only for loop state (loop targets and parameters have no
  "after"), and is left out when it would repeat the last row, as after a
  `while` loop's final failed check. The list
  sizes to its columns
  and is measured before its column is laid out. It has a bounded height
  and scrolls inside under a sticky header row; both it and the window are top-aligned to the clicked
  range, and an edge connects range → column. Choosing a sibling therefore moves
  nothing on the canvas, however long the loop.
- **Click a site** → truncate `path` at that window, append the site's first
  child. **Click a row** in a sibling list (or ↑/↓ inside it) → replace that
  column's entry.
- **Reverse navigation** (click output) and **exception auto-open** (on a failed
  run) are both just `path = pathTo(node)`: they leave no state or styling
  behind.
- Navigation never moves the canvas. The view changes only when the user pans
  or zooms.
- `path` is serializable (URL → "look at this exact moment").

## Server and sandbox

`POST /run {source, stdin}` → run `python -m codewalk run` in the sandbox →
JSONL trace. Syntax errors return a header plus `end: syntax_error`. No
streaming in v1.

The sandboxed process gets the source as a file in its workdir, the request's
stdin on fd 0, and writes the trace to a dedicated fd (not stdout — the program's
own raw writes to fd 1/2 must not corrupt the trace). The server relays the
trace and enforces the limits: it kills the process group at the time limit
or when the trace exceeds its byte cap, and appends `end: truncated` when it
cut the trace. A trace left without an end line reads as a timeout.

Runner interface (injected, so tests use a fake runner rather than module mocks)
with two implementations:

- `SubprocessRunner` — dev only. Subprocess with timeout.
- `NsjailRunner` — production (public hosting); **not built yet**. nsjail: no network namespace
  interfaces, read-only bind-mounted minimal rootfs with Python, small tmpfs
  workdir, cgroup memory (~256 MB) and pids limits, CPU and wall time limits,
  unprivileged user, seccomp policy. The server caps trace bytes read.

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
  unsafe assertions, no module mocking — is the house style. Blank lines
  between statements come from `@stylistic/eslint-plugin`'s
  `padding-line-between-statements`, loaded as a JS plugin.
- **Zod 4** for every boundary: the trace (untrusted) in `packages/trace`, the
  HTTP API via `fastify-type-provider-zod`. `spec/trace.schema.json` is generated
  from the Zod schemas and checked in; the Python tests validate against it, so
  the contract is enforced from both sides.
- **ts-pattern** for branching on the format's discriminated unions (`op`,
  `role`, `end.status`), always `.exhaustive()`.
- **Prettier** (also formats md/json/css), **knip** for unused
  files/exports/dependencies, **Vitest** for tests, Playwright for end-to-end
  from M3.

**web.** Vite, React 19 with **React Compiler** (Babel preset, Babel 7 — the
compiler skips components under Babel 8), Tailwind v4 + **shadcn** for chrome only (title bars,
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
- **Core end-to-end journeys** — none are automated yet; when an end-to-end suite
  is added, this is the complete list it may cover:
  1. Run a program → click a call site → the callee window opens.
  2. Click a loop → sibling list opens → switch iteration.
  3. Click an output line → the path to its site opens.
  4. A run that raises → the path to the exception origin opens automatically.
  5. A syntax error is shown and no trace tree appears.

## Deferred

The MVP is built: tracer, run server, canvas, trace tree, navigation. Not built:

- Production: the `NsjailRunner`, rate limiting, a run queue, deployment. Until
  then the server runs code unsandboxed and must stay on loopback.
- An automated end-to-end suite (see Testing for its scope).
- Opening the path to where a timed-out or truncated program was: the parsed
  trace does not record which nodes were still open at the end.
- The path in the URL — only meaningful once traces are shareable.

Further out:

- Expression values in general (`_cw_e` already sees them), then return values,
  then variable/heap state. Block inputs are the completed first step.
- Instrumenting lambdas, generator expressions, generators, `async`; iteration
  blocks for comprehensions.
- Further views over repetition (scrubbers, abbreviation).
- Skeleton-first recording with on-demand deterministic re-execution for large
  runs; compact event encoding.
- Multi-file programs, more languages (the second language is the real test of
  the format).
- Keeping several traces side by side.
