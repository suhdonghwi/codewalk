# codewalk trace format (v1)

A trace is the complete, language-agnostic record of one program run. The tracer
(per language) produces it; the viewer consumes it and knows nothing about the
source language beyond what is written here.

Example: [`fixtures/fact.py`](fixtures/fact.py) →
[`fixtures/fact.trace.jsonl`](fixtures/fact.trace.jsonl).

## Concepts

The trace is a tree of **nodes**. Every node is one execution of a source range
(a **loc**). A loc has one of three roles:

| Role    | Meaning                                                                                 | In the viewer          |
| ------- | --------------------------------------------------------------------------------------- | ---------------------- |
| `block` | One execution of a body of code: a module run, a function activation, a loop iteration. | A window.              |
| `stmt`  | A statement that started executing in the enclosing block. Always recorded.             | Lit (vs. dimmed) code. |
| `expr`  | An expression that was evaluated. Recorded only if something happened inside it.        | —                      |

A **site** is any `stmt` or `expr` node that directly contains a `block` node or
output. Sites are what the user interacts with: a site containing blocks is a
clickable range that opens those blocks as child windows; a site containing
output shows it inline.

Nesting rules:

- A `block` contains `stmt` nodes.
- A `stmt` contains `expr` nodes, and `block` nodes (a loop statement contains
  its iterations; a statement that implicitly runs user code contains that
  function's activation).
- An `expr` contains `expr` nodes (syntactic nesting) and `block` nodes (a call
  expression contains the callee's activation).
- Output and values attach to the innermost open node.

The viewer uses `role` for structure and the `title` and `unit` supplied on
block locs for display. It does not interpret their text, so a new language maps
its constructs onto the three roles and chooses its own block labels.

The same loc may be entered more than once within one block node (a call inside
a comprehension, a callback invoked repeatedly from native code). The viewer groups nodes by loc within a block and merges their child
blocks into one stack, in execution order.

## File layout

JSON Lines, UTF-8. Line 1 is the header; every following line is an event, in
execution order. The format is streamable and remains parseable if the run is
killed mid-way.

### Header

```json
{
  "codewalk": 1,
  "sources": [{ "file": "main.py", "text": "def fact(n):\n ..." }],
  "locs": [
    {
      "role": "block",
      "title": "main.py",
      "unit": "module",
      "file": 0,
      "start": 0,
      "end": 135,
      "parent": null
    },
    {
      "role": "stmt",
      "file": 0,
      "start": 0,
      "end": 12,
      "parent": 0
    },
    {
      "role": "block",
      "title": "fact",
      "unit": "call",
      "file": 0,
      "start": 0,
      "end": 92,
      "parent": 1
    },
    {
      "role": "expr",
      "file": 0,
      "start": 9,
      "end": 10,
      "parent": 1
    }
  ]
}
```

- `codewalk` — format version.
- `sources` — full text of every instrumented file. The viewer renders from this
  text, never from the editor, which may have changed since the run.
- `locs` — table of source ranges, referenced by index.
  - `role` — `block` | `stmt` | `expr`.
  - `title` — required on `block` locs and absent from other locs. What the
    viewer calls the window and its sibling-list row. The tracer never includes
    an execution index; the viewer adds one when a site ran several blocks.
  - `unit` — required on `block` locs and absent from other locs. The singular
    noun used when the viewer counts siblings; it pluralises by appending `s`.
  - `file` — index into `sources`.
  - `start`, `end` — half-open range, as absolute offsets into `text` in
    **UTF-16 code units** (what JS strings and Lezer use; tracers convert).
  - `parent` — index of the static (lexical) parent loc, `null` for the root.
    Used by the tracer runtime for stack repair and by the viewer to decide
    which statements belong to which block.

Python uses the file name and `module` for module blocks, the function name and
`call` for function blocks, and `iteration` for both fields on iteration blocks.

Range conventions:

- A `block` loc covers everything its window should show: the whole `def`, the
  whole loop statement (header included), the whole module.
- A compound statement's `stmt` loc covers **only its header**
  (`if n <= 1:`, `for i in range(2):`, `def fact(n):`). Statements in its body
  are separate `stmt` locs whose `parent` is the enclosing _block_, not the
  compound statement. Exception: the body of a loop belongs to the loop's
  iteration block, whose `parent` is the loop `stmt`.
- A header that is re-evaluated on every pass (a `while` condition) is covered
  by a second `stmt` loc with the same range whose `parent` is the iteration
  block. The condition's `expr` locs hang under it, so each check, and whatever
  it calls, belongs to its own iteration. The check that ends the loop is an
  iteration with only that `stmt` node. A header evaluated once (a `for`
  iterable) belongs to the loop `stmt`.

### Events

```json
{"op": "enter", "loc": 2}
{"op": "exit"}
{"op": "exit", "exc": "ZeroDivisionError: division by zero"}
{"op": "out", "stream": "stdout", "text": "fact 1\n"}
{"op": "value", "loc": 16, "text": "3"}
{"op": "end", "status": "ok"}
```

- `enter` — a node begins; `loc` gives its role. Node ids are implicit: the n-th
  `enter` in the file is node n (0-based). The first `enter` is the root block.
- `exit` — the innermost open node ends. `exc` (block nodes only) means the
  block was left by a propagating exception; the value is a one-line summary.
- `out` — output written while the innermost open node was executing. `stream`
  is `stdout` or `stderr`. Text is arbitrary chunks, not necessarily lines.
- `value` — the value of the range given by `loc`, which must refer to an
  `expr` loc. `text` is a bounded, one-line rendering; Python renders objects
  without a custom `__repr__` as `<ClassName>`. It attaches to the innermost
  open node like `out`. Tracers emit values only immediately after entering a
  block: a function's parameters and a loop's targets. A value therefore always
  belongs to a block node. The viewer places it immediately after the source
  range of `loc` and includes it in titles and sibling rows too.
- `end` — last line. `status`:
  - `ok` — program finished.
  - `exception` — uncaught exception; `traceback` holds the user-facing text.
  - `truncated` — the tracer hit its event limit and stopped recording.
  - `timeout` — killed by the runner (appended by the runner, not the tracer).
  - `syntax_error` — the source did not parse; `message`, `file`, `start`,
    `end` locate it. No `enter` events precede it.

Well-formedness: `enter`/`exit` are properly nested. Nodes still open at `end`
or at EOF are implicitly closed there (truncation, timeout, hard kill). If the
file has no `end` line the viewer treats it as `timeout`. A final line that has
no terminating newline and is not valid JSON is ignored: the process was killed
mid-write. Any other unparseable line makes the whole trace invalid.

A `value` event whose `loc` is out of range or not an `expr` loc is malformed,
as is a `value` event with no open block node.

### What is _not_ recorded

- `expr` nodes with nothing inside them (no block, no output, no non-empty
  descendant) are never written. Absence of an `expr` node says nothing about
  whether the expression ran; use `stmt` nodes for that.
  Locs are a static table, however, so an `expr` loc may exist only as an anchor
  for values and never be entered as a node.
- Values are recorded for block inputs only. Expression values, variables and
  heap state are not recorded.

## Derived views

**Output window** — all `out` events concatenated in file order. Each chunk
remembers its node, so clicking output resolves to a path from the root.

**Block values** — all values attached directly to a block, in file order.

**Path to a node** — the chain of `block` ancestors of a node is the list of
windows to open; the chain of sites between them is the list of ranges to
highlight.

**Statement state in a window** for block node _B_ with loc _b_ — for every
`stmt` loc _s_ lying inside _b_'s range, find its nearest `block` ancestor via
`parent`:

- it is _b_, and _B_ has a child node for _s_ → **lit**;
- it is _b_, and _B_ has none → **dimmed** (did not run in this execution);
- it is another block loc → **inert** (belongs to a nested function or loop
  body; it becomes live in that block's own window).

Text covered by no `stmt` loc is neutral. Where two `stmt` locs cover the same
text (a `while` header), the one owned by _b_ decides: the header is lit in the
parent window through the loop `stmt` and lit in an iteration window through the
iteration's own `stmt`. A `for` header is inert in an iteration window: it
belongs to the parent block only.

**Exception origin** — follow `exit.exc` from the root to the deepest block that
has it; the origin is that block's last `stmt` node. A chain that stops before
the root means the exception was caught there.

## Example

`fixtures/fact.py`:

```python
def fact(n):
    print("fact", n)
    if n <= 1:
        return 1
    return n * fact(n - 1)

for i in range(2):
    print(fact(i + 1))
```

Its trace, drawn as a tree (`B` block, `S` stmt, `E` expr, `V` value):

```
B module
  S def fact(n):
  S for i in range(2):
    B iteration
      V i=0
      S print(fact(i + 1))
        E print(fact(i + 1))
          E fact(i + 1)
            B function fact
              V n=1
              S print("fact", n)
                E print("fact", n)          out "fact 1\n"
              S if n <= 1:
              S return 1
          out "1\n"
    B iteration
      V i=1
      S print(fact(i + 1))
        E print(fact(i + 1))
          E fact(i + 1)
            B function fact
              V n=2
              S print("fact", n)
                E print("fact", n)          out "fact 2\n"
              S if n <= 1:
              S return n * fact(n - 1)
                E n * fact(n - 1)
                  E fact(n - 1)
                    B function fact
                      V n=1
                      S print("fact", n)
                        E print("fact", n)  out "fact 1\n"
                      S if n <= 1:
                      S return 1
          out "2\n"
```

Things to notice:

- `range(2)`, `n <= 1`, `i + 1`, `n - 1` were evaluated but are absent: nothing
  happened inside them.
- `E fact(i + 1)` is nested inside `E print(…)` (syntactic nesting), and the
  output `"1\n"` attaches to `print(…)` after `fact(i + 1)` has closed.
- In the first `fact` activation `return n * fact(n - 1)` has no `stmt` node →
  dimmed in that window; in the second, `return 1` is dimmed.
- Clicking the 4th output line (`fact 1`) resolves to the path
  module → iteration 1 → fact → fact.
