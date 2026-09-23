# codewalk — design

codewalk is a code execution visualizer. You write a program, run it, and
codewalk records everything that happened. Instead of stepping through the run
in time, you explore it as a structure laid out in space: every call and every
loop iteration gets a window of its own, and you open them as you go.

## Why

When you write a program or work through an algorithm problem, you can't see
what the code actually does while it runs. The usual tools make you work for
it:

- A **debugger** needs breakpoints in the right places and a lot of stepping,
  and you start over whenever you step past the moment you cared about.
- **Debug prints** give you a flat stream of text, and you have to work out
  when and where each line came from.

codewalk records the whole run first and then shows it in the shape of the
execution. You start with a window showing the program. Click the place where a
call happened and a window for that call opens beside it, and so on down. Loops
unroll into iterations. Output appears on the line that printed it, so debug
prints keep their context.

## Principles

1. **One UI idea.** A window shows one execution of a piece of source. The
   ranges in it that started further executions are clickable, and clicking
   one opens those executions as windows. Calls, loops, callbacks and
   navigation all work this way; there are no special-purpose widgets.
2. **A language-agnostic trace.** Each language needs its own tracer, but the
   trace format and the viewer are shared. The viewer knows only source ranges
   and three node roles.
3. **Degrade gracefully.** Code the tracer doesn't understand still runs
   correctly and its output still lands on the line that caused it. It just
   can't be expanded.
4. **Learners and algorithm solvers first.** v1 handles a single Python file
   with small inputs. Hard limits stand in for scalability work.

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
sandboxed process, so untrusted source never reaches a parser outside the
sandbox.

- `spec/` — the [trace format](../spec/trace-format.md), its JSON Schema and
  fixtures: the contract between tracers and the viewer.
- `apps/tracer-python/` — the Python tracer (instrumenter and runtime), stdlib
  only.
- `packages/trace/` — trace schemas, parser and tree builder, shared by the web
  client and the server.
- `apps/server/` — `POST /run {source, stdin}` → trace, through a pluggable
  runner.
- `apps/web/` — the viewer: canvas, editor and trace windows.

## Trace model

The [trace format](../spec/trace-format.md) has the details. A trace is a tree
of nodes; each node is one execution of a source range and has one of three
roles:

- **block** — a module run, function call or loop iteration. Each block is a
  window.
- **stmt** — a statement that ran in its block. Always recorded, so the viewer
  knows which lines ran.
- **expr** — an expression, recorded only when something happened inside it.

A **site** is a stmt or expr that directly contains blocks or output. Sites
with blocks become clickable ranges, and sites with output get their output
shown inline. The viewer doesn't tell calls from loops, or function calls from
iterations: they are all sites and blocks.

Besides structure, v1 records which statements ran, output, exceptions and
values: each block's inputs on entry (parameters, loop targets and loop state)
and the values each statement gave to the variables it assigned or changed.

## Tracer

The Python tracer rewrites the source with `ast` and runs the result against a
small runtime. Expressions and statements get lightweight markers placed
in-line, which leave the program's behaviour intact. Functions and loop
iterations get explicit blocks, which make the structure reliable.

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

- **Expressions** are wrapped as `_cw_e(_cw_b(id), <expr>)`. Argument order
  gives begin → evaluate → end, and the expression still runs in the user's
  own frame, so `super()`, `locals()`, recursion depth and tracebacks behave as
  before. Only expressions that can run code are wrapped: calls, operators,
  comparisons, attribute access, subscripts and `await`.
- **Statements** get a `_cw.stmt(id)` marker in front. The next marker or the
  block's exit closes them, so they need no end marker. Compound statements
  record only their header. Clause headers (`else`, `except`, `finally`,
  `case`) get a marker of their own, so a clause that never ran shows as not
  run.
- **Blocks** wrap module and function bodies (`_cw.block`) and loop bodies
  (`_cw.iteration`) in a `with`. That guarantees the block closes on `return`,
  `break`, `continue` and exceptions, and lets it see the exception that left
  it.
- **Stack repair.** When an expression raises, its `_cw_e` never runs, so the
  runtime's stack of open nodes can go stale. Every location knows its static
  parent, and at each statement, expression and iteration start the runtime
  pops back to it.
- **Lazy emission.** An expression is only written to the trace once something
  happens inside it (output or a block). The rest are dropped, so wrapping
  generously costs CPU time but not trace size.
- **Statement fallback.** A block that starts with no expression open belongs
  to the current statement, which becomes the site: `for` calling `__next__`,
  `a[i] = v` calling `__setitem__`, and so on.
- **Output.** `sys.stdout` and `sys.stderr` are replaced with writers that
  attach output to the innermost open node. Output from library code therefore
  lands on the user expression that caused it.
- **Values** are structured snapshots: primitives inline, everything else a
  reference to an object with an id, defined again only when it changes. The
  tracer walks what a value reaches breadth-first, keeping the first 100
  items of each container and opening at most 200 objects per value, and
  holds every identified object so its address is never reused. A container
  whose members are the same objects as in the variable's previous snapshot
  reuses that snapshot's shape, so an unchanged structure costs an identity
  check per member. Recording is paused while taking a snapshot, so a user
  `__repr__` cannot change the trace.
- **Loop state.** An iteration's inputs, beyond its loop targets, are the
  variables the body may read before assigning them, found by a
  definite-assignment walk over the body. Functions, classes and modules don't
  count. Mutation needs no special case: a list the body appends to is read
  before it is assigned, and its value differs between iterations.
- **Changes.** Every block watches the variables its code mentions. After each
  statement the runtime snapshots them again and records, on that statement,
  every name it bound or whose snapshot changed. So `mid = (lo + hi) // 2` is
  recorded even when `mid` keeps its value, and `remember(seen, w)` records
  `seen` because it changed. A loop is a single statement of its parent block,
  so the parent sees the loop's end state. Only the first thousand calls of a
  function watch their variables, so deep recursion stays cheap.
- **Limits** belong to the runner. The tracer flushes the trace periodically,
  so a run killed at the time limit or byte cap keeps what it recorded.

How Python constructs map onto the trace:

- **`def`** — the header is a statement of the defining block; the body is a
  function block.
- **`for` / `while`** — the header is a loop statement that contains the
  iteration blocks. A `for` iterable is evaluated once, in the parent window. A
  `while` condition is checked inside each iteration, so the final failed check
  is an iteration of its own in which nothing else ran.
- **`if`, `with`, `try`, `class`** — only the header is recorded; the body
  statements are siblings in the enclosing block.
- **Comprehensions** — no iteration blocks, but calls inside them still
  expand.
- **Lambdas, generators, generator expressions, `async`** — not instrumented.
  They run later or re-entrantly, outside the code that defined them, which
  breaks the stack discipline. They run normally and their output goes to the
  calling site.
- **Builtins and library code** — opaque call expressions. `print(...)` is
  exactly this.
- **Threads** — unsupported.

Instrumentation preserves line numbers, and tracer frames are hidden from
tracebacks. Expect a 5–20× slowdown; the time limits allow for it.

## Viewer

### Canvas

The viewer is a hand-made infinite canvas with pan and zoom. The layout and
interactions are too specific for a graph library.

The editor, stdin and output windows can each be dragged, and so can the trace
tree as a whole. Windows inside the tree cannot: the tree is laid out
automatically and moves as one unit, so its shape can't be broken. By default
the editor sits at the origin, stdin and output are to its left, and the trace
tree grows rightwards from its right side.

Windows don't resize. Each follows a fixed size rule, and its content scrolls
once it no longer fits. A scroll wheel over scrollable content scrolls it;
anywhere else it pans the canvas.

Navigation never moves the canvas. Only the user pans or zooms.

### Windows

- **Editor** — CodeMirror with a Run button that sends source and stdin.
- **stdin** — plain text fed to the program.
- **Output** — the program's output, followed by a traceback, truncation or
  timeout notice. Clicking any chunk opens the path to the site that printed
  it.
- **Trace window** — a read-only view of one block's source, highlighted the
  same way as the editor, with shared indentation trimmed. It shows:
  - which statements ran: lit if they ran here, faded if they belong to a
    nested function or loop body (they come alive in that block's own window),
    grey if they did not run;
  - clickable ranges for sites that contain blocks;
  - chips for values, output and exceptions.

**Chips** are one primitive in three tints: value, output and exception. A chip
about a name follows the name where it is bound, like a parameter on the `def`
line or a loop target on the `for` line. A chip about a whole line (output, an
exception, loop state, the changes a statement made like `lo → 8`) sits in a
column to the right of the code, so the block's data reads top to bottom beside
its code. Long output expands into a panel below its line. A value that is the
same in every sibling is faded. The line an exception came from is tinted and
its line number turns red.

The title bar shows the block's title, numbered when its site ran several
blocks (`iteration 2`). A red dot marks a block that exited with an exception.
A window can collapse to its title bar.

Running again replaces the trace; the tree keeps its position on the canvas.

### Navigation: one path

Only one sibling is expanded at a time, across the whole tree, so the trace
view is derived from a single value:

```
path: NodeId[]      // expanded blocks, root → deepest
```

- Column _k_ of the tree shows the children of the site selected in column
  _k−1_: the expanded child window, preceded by a **sibling list** when the
  site ran several blocks. Think Finder's column view, on a canvas.
- The sibling list is a table with a row per sibling and a column per input
  value that differs between them. Reading down a column shows how the state
  evolves; a value that repeats the row above is faded, so changes stand out.
  If the last iteration changed the loop state, a pinned `after` row shows the
  end state. The list and the window are top-aligned to the clicked range, so
  switching siblings moves nothing on the canvas.
- Clicking a site truncates `path` at its window and appends the site's first
  child. Clicking a row in a sibling list (or pressing ↑/↓) replaces that
  column's entry.
- Clicking output and auto-opening an exception are both just
  `path = pathTo(node)`.
- `path` is serializable, so a URL can point at an exact moment.

## Server and sandbox

`POST /run {source, stdin}` runs the tracer in the sandbox and returns the
JSONL trace. A syntax error comes back as a header plus `end: syntax_error`.
v1 doesn't stream.

The sandboxed process gets the source as a file, stdin on fd 0, and writes the
trace to a dedicated fd, so the program's own writes to stdout and stderr
cannot corrupt it. The server kills the process group at the time limit or when
the trace exceeds its byte cap, and appends `end: truncated` when it cut the
trace. A trace with no end line reads as a timeout.

The runner is an injected interface with two implementations:

- `SubprocessRunner` — development only, no isolation.
- `NsjailRunner` — for public hosting; not built yet. No network, a read-only
  minimal rootfs, a small tmpfs workdir, memory, pid and CPU limits, an
  unprivileged user and a seccomp policy. nsjail needs real kernel access, so
  it runs on a VM rather than a gVisor or PaaS container. The host holds no
  secrets and is disposable. Rate limiting and a small run queue sit in front.

**The trace is untrusted input.** User code shares a process with the tracer
runtime and can forge events. The viewer validates the schema, caps sizes and
never renders trace content as HTML.

## Not built yet

The MVP is done: tracer, run server, canvas, trace tree and navigation. Still
missing:

- Production hosting: the `NsjailRunner`, rate limiting, the run queue and
  deployment. Until then the server runs code unsandboxed and must stay on
  loopback.
- Opening the path to where a timed-out or truncated program was. The parsed
  trace doesn't record which nodes were still open.
- Putting the path in the URL, which only matters once traces can be shared.

Further out:

- General expression values (`_cw_e` already sees them), then return values,
  then variable and heap state.
- Instrumenting lambdas, generators and `async`; iteration blocks for
  comprehensions.
- More views over repetition, such as scrubbers and collapsing repeats.
- Skeleton-first recording with deterministic re-execution on demand for large
  runs, and a more compact event encoding.
- Multi-file programs and more languages. The second language is the real test
  of the format.
- Several traces side by side.
