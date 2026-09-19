# v1 implementation plan

> Transient working doc — delete when v1 ships. The source of truth for _what_ we
> build is [design.md](design.md) and [the trace spec](../spec/trace-format.md);
> this file is only the _order_ to build it in. Tick steps off as they land.

```
0 scaffold ─▶ 1 packages/trace ─┬─▶ 2 runtime ─▶ 3 instrumenter ─▶ 4 server ─┐
                                └─▶ 5 web shell ─▶ 6 trace window ─▶ 7 tree ─┴▶ 8 navigation ─▶ 9 e2e ─▶ 10 production
```

The Python track (2–4) and the web track (5–7) are independent: the web track
runs against `spec/fixtures/` until the server exists.

## 0. Scaffold

- [x] `mise.toml` pinning Node 24, pnpm, uv (Python 3.13 via uv); tasks `dev`, `check`.
- [x] pnpm workspace (`apps/web/`, `apps/server/`, `packages/trace/`), shared strict tsconfig,
      oxlint (type-aware) + vendored anti-slop, prettier, knip, vitest.
- [x] `apps/tracer-python/` uv project: ruff, ty, pytest. No runtime deps.
- [x] CI runs `mise run check`.

Done when `mise run check` is green on the empty skeleton.

Rule from here on: a dependency is installed by the step that first uses it
(knip fails the check on unused ones). `jsonschema` arrives with step 3.

## 1. `packages/trace`

- [x] Zod schemas for header and events; generate and check in `spec/trace.schema.json`.
- [x] `parseTrace(jsonl)` → node tree (implicit ids, implicit close at `end`/EOF,
      missing `end` → `timeout`).
- [x] Derived views from the spec: output chunks → node, `pathTo(node)`, sites of a
      block (grouped by loc), statement state (lit/dimmed/inert), has-output,
      exception origin.

Done when all of these give the right answers for the `fact` fixture.

## 2. Tracer runtime (`_cw`)

- [x] Node stack; `block`/`iteration` context managers, `stmt`, `_cw_b`/`_cw_e`.
- [x] Stack repair via the `parent` table; never pops a block.
- [x] Lazy emission of expr nodes; `exit.exc` on blocks.
- [x] stdout/stderr hook → `out` events; event limit → `end: truncated`;
      writer to a dedicated fd.

Done when the hand-instrumented sample in design.md produces the fixture's events.

## 3. Instrumenter + CLI

- [x] Loc table: roles, kinds, header-only compound statements, UTF-16 offsets, `parent`.
- [x] Transforms: module, `def`, `for`/`while` (loop stmt + iteration block),
      statement markers, selective expression brackets. Leave lambdas,
      generator expressions, generators and `async` bodies untouched.
- [x] `python -m codewalk run main.py`: instrument, run, `end` status incl.
      `exception` (filtered traceback) and `syntax_error`.
- [x] Flush/timeout policy: the CLI runs a repeating ~100 ms interval timer
      that flushes the sink and, once the time limit has passed or the trace is
      truncated, raises in the main thread; `finish("timeout")` then ends the
      trace cleanly. Once a stop is requested every statement marker raises too,
      so the program's own bare `except:` cannot swallow it. The server's hard
      kill is only a backstop (≤ one tick lost).

Note: loc numbering in the hand-written `fact` fixture is not normative. If the
instrumenter numbers differently, regenerate it once and review the diff.

## 4. Server

- [x] Fastify `POST /api/run {source, stdin}` (Zod type provider) → JSONL.
- [x] `Runner` interface; `SubprocessRunner`: spawn the CLI, source file in a temp
      dir, stdin on fd 0, trace on its own fd, wall timeout, byte cap, append
      `end: timeout` when killed.

Done when a hello-world, an infinite loop and an output flood each come back
with the right `end.status`.

## 5. Web shell

- [x] Vite + React 19 + Tailwind v4 + shadcn (`button`, `tooltip`) + lucide icons; Zustand store.
- [x] Canvas: pan/zoom via transient subscription → CSS transform; draggable
      top-level objects; `Window` chrome component.
- [x] Editor (CodeMirror 6), stdin and output windows at default positions;
      Run → `/api/run` (Vite proxy) → `parseTrace` → store. Rerun replaces the trace.

## 6. Trace window

- [x] Lezer highlight with the editor's `HighlightStyle` → flat span list split
      at loc boundaries.
- [x] Lit / dimmed / inert statements; clickable sites; inline output at line
      end; title bar (name, 0-based index, output/exception dot).
- [x] Collapsed (title-bar-only) state — done in step 7 with the sibling stacks.

Done when the `fact` fixture's root window renders correctly with no server.

## 7. Trace tree

- [x] `path: NodeId[]` as the only view state; click site → truncate + append
      first child; click title bar → replace that column's entry.
- [x] Column layout as a pure function of (trace, path, window sizes): child
      stacks, vertical alignment to the site, edges site → stack.
- [x] The tree moves as one unit, dragged by its root.

Done when you can walk the fixture from the module down to the innermost `fact`.

## 8. Navigation and end states

- [ ] Click output chunk → `path = pathTo(node)` + highlight the site.
- [ ] Failed run → auto-open the path to the exception origin; show traceback.
- [ ] Syntax error, truncated and timeout notices.
- [ ] Optional: `path` in the URL.

## 9. End-to-end tests

- [ ] The five Playwright journeys listed in design.md → Testing. No others.

## 10. Production

- [ ] `NsjailRunner`: config, minimal rootfs with the pinned Python + tracer,
      cgroup/time/pids limits, no network, seccomp.
- [ ] `@fastify/rate-limit`, run-queue semaphore, trace byte cap.
- [ ] Deploy on a VM (EC2): reverse proxy + Node server serving the built web app.

Done when hostile inputs (fork bomb, memory bomb, infinite print, network
access, reading outside the workdir) are all contained.
