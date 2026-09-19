# v1 implementation plan

> Transient working doc — delete when v1 ships. The source of truth for *what* we
> build is [design.md](design.md) and [the trace spec](../spec/trace-format.md);
> this file is only the *order* to build it in. Tick steps off as they land.

```
0 scaffold ─▶ 1 packages/trace ─┬─▶ 2 runtime ─▶ 3 instrumenter ─▶ 4 server ─┐
                                └─▶ 5 web shell ─▶ 6 trace window ─▶ 7 tree ─┴▶ 8 navigation ─▶ 9 e2e ─▶ 10 production
```

The Python track (2–4) and the web track (5–7) are independent: the web track
runs against `spec/fixtures/` until the server exists.

## 0. Scaffold

- [ ] `mise.toml` pinning Node 24, pnpm, Python (one minor), uv; tasks `dev`, `check`.
- [ ] pnpm workspace (`web/`, `server/`, `packages/trace/`), shared strict tsconfig,
      oxlint (type-aware) + vendored anti-slop, prettier, knip, vitest.
- [ ] `tracer/` uv project: ruff, ty, pytest, `jsonschema`. No runtime deps.
- [ ] CI runs `mise run check`.

Done when `mise run check` is green on the empty skeleton.

## 1. `packages/trace`

- [ ] Zod schemas for header and events; generate and check in `spec/trace.schema.json`.
- [ ] `parseTrace(jsonl)` → node tree (implicit ids, implicit close at `end`/EOF,
      missing `end` → `timeout`).
- [ ] Derived views from the spec: output chunks → node, `pathTo(node)`, sites of a
      block (grouped by loc), statement state (lit/dimmed/inert), has-output,
      exception origin.

Done when all of these give the right answers for the `fact` fixture.

## 2. Tracer runtime (`_cw`)

- [ ] Node stack; `block` context manager, `stmt`, `_b`/`_e`.
- [ ] Stack repair via the `parent` table; never pops a block.
- [ ] Lazy emission of expr nodes; `exit.exc` on blocks.
- [ ] stdout/stderr hook → `out` events; event limit → `end: truncated`;
      writer to a dedicated fd.

Done when the hand-instrumented sample in design.md produces the fixture's events.

## 3. Instrumenter + CLI

- [ ] Loc table: roles, kinds, header-only compound statements, UTF-16 offsets, `parent`.
- [ ] Transforms: module, `def`, `for`/`while` (loop stmt + iteration block),
      statement markers, selective expression brackets. Leave lambdas,
      generators and `async` bodies untouched.
- [ ] `python -m codewalk run main.py`: instrument, run, `end` status incl.
      `exception` (filtered traceback) and `syntax_error`.
- [ ] Goldens in `spec/fixtures/`, one construct each: caught exception, uncaught
      exception, `while`, `break`/`continue`, call inside a comprehension,
      callback from native code (`sorted(key=…)`), implicit call (`__lt__`), `input()`.
- [ ] Invariant checker over every fixture: well-nested, role nesting rules,
      schema-valid, `out` events == output of the uninstrumented program.

Note: loc numbering in the hand-written `fact` fixture is not normative. If the
instrumenter numbers differently, regenerate it once and review the diff.

## 4. Server

- [ ] Fastify `POST /api/run {source, stdin}` (Zod type provider) → JSONL.
- [ ] `Runner` interface; `SubprocessRunner`: spawn the CLI, source file in a temp
      dir, stdin on fd 0, trace on its own fd, wall timeout, byte cap, append
      `end: timeout` when killed.

Done when a hello-world, an infinite loop and an output flood each come back
with the right `end.status`.

## 5. Web shell

- [ ] Vite + React 19 + Tailwind v4 + shadcn; Zustand store.
- [ ] Canvas: pan/zoom via transient subscription → CSS transform; draggable
      top-level objects; `Window` chrome component.
- [ ] Editor (CodeMirror 6), stdin and output windows at default positions;
      Run → `/api/run` (Vite proxy) → `parseTrace` → store. Rerun replaces the trace.

## 6. Trace window

- [ ] Lezer highlight with the editor's `HighlightStyle` → flat span list split
      at loc boundaries.
- [ ] Lit / dimmed / inert statements; clickable sites; inline output at line
      end; title bar (kind + name, has-output marker); collapsed state.

Done when the `fact` fixture's root window renders correctly with no server.

## 7. Trace tree

- [ ] `path: NodeId[]` as the only view state; click site → truncate + append
      first child; click title bar → replace that column's entry.
- [ ] Column layout as a pure function of (trace, path, window sizes): child
      stacks, vertical alignment to the site, edges site → stack.
- [ ] The tree moves as one unit, dragged by its root.

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
