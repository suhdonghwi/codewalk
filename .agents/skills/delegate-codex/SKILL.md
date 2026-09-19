---
name: delegate-codex
description: 'Delegate hands-on implementation work (features from a spec, bug fixes, refactors, test writing, mechanical migrations) to Codex CLI. Claude writes the spec, delegates the build, then reviews and verifies the result. Use when a task is well-specified implementation work; keep design, architecture, and tiny edits in Claude.'
---

# Delegate to Codex

Codex types, Claude thinks and verifies: Claude tokens are metered and
expensive, Codex is flat-rate and strong at writing code. The win is moving
generation tokens to Codex while Claude spends only on spec + diff review.
Don't ping-pong trivia through delegation; don't re-read what Codex already
summarized.

## Route

Delegate to Codex:

- implementation from a frozen spec; refactors; mechanical migrations
- bug fixes (known repro, or diagnose-then-fix); CI/lint/type failures
- test writing, coverage fills
- dependency bumps, scripts/tooling

Keep in Claude:

- design, API design, architecture, naming, UX judgment
- tasks where writing the spec IS the work (ambiguity = design)
- tiny edits (~<20 lines, single obvious change) — delegation overhead loses
- anything needing session tools (MCP, secrets)

Mixed task: Claude designs first, freezes spec, delegates build-out.
Heuristic: prompt reads as a work order → delegate; writing it forces
decisions → design, Claude.

## Invoke

Prompt via a file, never inline quoting. Write the prompt with the `Write`
tool (not a shell heredoc) into the session scratchpad, then launch with ONE
plain command:

```bash
command codex exec --yolo -C /abs/path/to/repo \
  -m gpt-5.6-sol \
  -c model_reasoning_effort="high" \
  --disable fast_mode \
  -o /abs/scratchpad/codex-<task>-out.md - </abs/scratchpad/codex-<task>-prompt.md 2>/dev/null
```

- **Literal absolute paths only. No `VAR=...` prefix, no `VAR=...;` setup
  segment, no `$VAR`, `$(mktemp)`, backticks or heredocs in the launch
  command.** The permission allowlist matches the command text as written
  (`Bash(command codex exec *)`): a leading assignment such as
  `SP=/path command codex exec ...` is not stripped for allow rules, and every
  `;`/`&&` segment must match on its own — so any of those forms turns an
  auto-allowed run into a permission prompt (or a block in non-interactive
  mode). Spell the scratchpad path out each time.
- Model: pin `gpt-5.6-sol`, effort `high`, fast mode OFF — explicitly, don't
  rely on user config. Swap `--disable fast_mode` for `--enable fast_mode`
  only when the user has explicitly asked for fast mode.
- `--yolo` is the house default; Codex may run commands/tests freely. Keep
  prompts scoped to the target repo.
- stderr suppressed (thinking noise bloats context); drop `2>/dev/null` only
  to debug a failing run. If a run exits in seconds having produced nothing,
  read the log tail before relaunching — the error names the cause.
- read the `-o` file for the result; don't parse the JSONL stream
- new work orders go to FRESH `codex exec` sessions with self-contained
  prompts. Do not resume a long-lived session for a new order — saturated
  sessions misread work orders as configuration and no-op ("Understood…").
- **every codex run gets its own harness-tracked background command
  (`run_in_background: true`)** — one sidebar chip per worker, completion
  notification included. Chain setup steps INSIDE that tracked command. Never
  `&`-fork workers from a shared launcher: the workers become invisible
  orphans.
- long runs: read the `-o` file on exit; don't kill quiet runs <30 min
- parallel independent tasks OK: separate dirs, separate `-o` files, one
  tracked background command per worker
- outside a git repo add `--skip-git-repo-check`

Follow-up fixes — cheaper than fresh runs, keeps context. `resume` has no
`-C`/`--yolo`: run from the repo dir, spell the long flag (the `cd` segment
needs its own allow rule, e.g. `Bash(cd *)`; same literal-path rule applies):

```bash
(cd /abs/path/to/repo && command codex exec resume --last \
  --dangerously-bypass-approvals-and-sandbox \
  -o /abs/scratchpad/codex-<task>-out.md - </abs/scratchpad/codex-<task>-followup.md 2>/dev/null)
```

## Liveness watchdog (long monitored runs)

For runs you must not babysit, trade the stderr suppression for a log and
watch its mtime; read only the `-o` file into context, never the log body.

```bash
command codex exec --yolo -C /abs/path/to/repo -m gpt-5.6-sol \
  -c model_reasoning_effort="high" --disable fast_mode \
  -o /abs/scratchpad/codex-<task>-out.md - </abs/scratchpad/codex-<task>-prompt.md \
  >/abs/scratchpad/codex-<task>.log 2>&1
# run as its own Bash run_in_background call (tracked chip + notification)
```

- Capture the session id immediately:
  `grep -m1 "session id:" /abs/scratchpad/codex-<task>.log`.
  `resume --last` is cwd-filtered but races with any parallel Codex on the
  machine — with the id saved, recovery is deterministic.
- Watchdog loop (`Monitor` tool): every 60s, if the codex process is alive
  but the log file mtime is older than ~300s, treat it as hung. Because stderr
  (thinking stream) is in the log, mtime stays fresh during long reasoning —
  5 min of true silence is a real hang, not thinking.
- Recovery: kill the pid, then resume the SAME session with an explicit id so
  no context is lost:

```bash
(cd /abs/path/to/repo && command codex exec resume <session-id> \
  --dangerously-bypass-approvals-and-sandbox \
  -o /abs/scratchpad/codex-<task>-out.md - </abs/scratchpad/codex-<task>-resume.md)
# resume.md: "You were interrupted. Continue exactly where you left off; finish the task and produce the required final report."
```

- Exit watchdog silently when the process ends normally; emit only on
  staleness.

## Prompt contract

Codex starts with zero session context. Every prompt: goal, exact repo/paths,
constraints, non-goals, proof expected (exact test command), output shape
("report files changed + test output"). Spec quality decides success.

**Every hard prohibition needs an escape hatch.** A cornered worker satisfies
the letter of the gates (e.g. hand-minifying identifiers to pass a size
budget). Pair each hard constraint with the sanctioned exit: "if gate X fails
after honest attempts: STOP, report exact numbers/diagnosis, do not work
around." Treat a stop-report as a successful run — it is the coordinator's
decision point.

## Verify (Claude, always)

- `git status -sb` + read the full diff; judge like a contributor PR
- run focused tests yourself or demand proof output; Codex claims are
  advisory. Worker reports are accurate but incomplete — pathologies live in
  the code, not the summary.
- iterate via resume; after 2 failed rounds, take over and do it directly
- **check for a live worker in the repo before you edit or commit**:
  `pgrep -fl "codex exec"`. A run whose deliverable is already in the tree
  can keep looping and overwrite your fixes mid-review. Stop it once you have
  verified its output rather than racing it.
- test-helper edits are a red-flag class of their own (shims that keep suites
  green while hiding a broken migration)
