# codewalk trace format (v2)

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
  "codewalk": 2,
  "sources": [{ "file": "main.py", "text": "def fact(n):\n ..." }],
  "literals": {
    "list": ["[", "]"],
    "tuple": ["(", ")"],
    "set": ["{", "}"],
    "dict": ["{", "}"]
  },
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
- `literals` — the types the language writes with a bare literal, each with
  its opening and closing bracket. The viewer writes a sequence, set or mapping
  of one of these types between its brackets and without a type name, and any
  other one after its type name, between its kind's brackets (`[]` for a
  sequence, `{}` for a set or a mapping).
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
  - `rebinds` — optional, on iteration `block` locs only. The loop state
    variables (see `value` below) that the loop's condition or body may
    assign, in the order of the loop state. Absent when there are none. Loop
    state not listed here can change between iterations only through an
    object the variable refers to.

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
- A clause header inside a compound statement (`else:`, `except …:`,
  `finally:`, `case …:`) is a `stmt` loc of its own, covering only the header,
  whose `parent` is the enclosing block. It starts executing when its body
  does, so a clause that was not entered has no node and reads as dimmed.
  (Python's `elif` is an `if` statement already.)
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
{"op": "exit", "jump": "break"}
{"op": "out", "stream": "stdout", "text": "fact 1\n"}
{"op": "value", "loc": 16, "value": {"kind": "number", "text": "3"}}
{"op": "obj", "id": 0, "kind": "sequence", "type": "list", "items": [{"kind": "number", "text": "1"}]}
{"op": "value", "name": "xs", "value": {"ref": 0}}
{"op": "end", "status": "ok"}
```

- `enter` — a node begins; `loc` gives its role. Node ids are implicit: the n-th
  `enter` in the file is node n (0-based). The first `enter` is the root block.
- `exit` — the innermost open node ends. `exc` is a one-line summary of an
  exception. On a block node it means the block was left by a propagating
  exception. On a stmt node it means the statement was interrupted by an
  exception that a handler in the same block caught; the handler's clause
  header is the next statement. Expr nodes never carry it. `jump` (block nodes
  without `exc` only) says a loop iteration cut its loop short: `break` ended
  the loop, `return` ended the enclosing function call. It is absent when the
  iteration reached its end or went on to the next one, so a loop whose last
  iteration has neither `jump` nor `exc` ran until it had nothing left to do.
- `out` — output written while the innermost open node was executing. `stream`
  is `stdout` or `stderr`. Text is arbitrary chunks, not necessarily lines.
- `value` — a value (see [Values](#values)), in one of two forms. `{loc, value}`
  is the value of the range given by `loc`, which must refer to an `expr` loc:
  a name bound at that spot. `{name, value}` is the value of a variable the
  block receives without binding it anywhere in its range. It attaches to the
  innermost open node like `out`, which is a block or a statement:
  - On a `block` node, values are the block's inputs, emitted immediately after
    entering it: a function's parameters and an iteration's loop targets
    (anchored), and an iteration's loop state (named). Loop state is the
    variables an iteration may read before assigning them; one that is still
    unbound is left out. The viewer places an anchored value immediately after
    the source range of `loc` and a named value that the loop rebinds or that
    differs between siblings on a row above the block's first line, and shows
    both kinds in sibling rows.
  - On a `stmt` node, a named value is the variable's value right after that
    statement, emitted before the statement closes because the statement
    assigned the variable or changed its value: the variable now holds a
    different primitive or object, or an object it reaches changed (a list it
    appended to, also through a call). The viewer places it with the
    statement's line.
    Python records these for the variables a block's code mentions, local or
    global, but not functions, classes or modules. A loop statement is a
    statement of its parent block, so the values on it are the loop's end
    state, taken before any `else` clause runs; its own loop targets are left
    out. The viewer places them after the loop's body. Calls of one function
    beyond its first 1000 record none.
- `obj` — the state of an object, referenced from values by `id`. It attaches
  to no node. See [Objects](#objects).
- `end` — last line. `status`:
  - `ok` — program finished.
  - `exception` — uncaught exception; `traceback` holds the user-facing text.
  - `truncated` — the runner cut the trace at its size cap and killed the
    process (appended by the runner, not the tracer).
  - `timeout` — the runner killed the process at its time limit. Nothing
    writes it: a trace without an `end` line reads as `timeout`.
  - `syntax_error` — the source did not parse; `message`, `file`, `start`,
    `end` locate it. No `enter` events precede it.

Well-formedness: `enter`/`exit` are properly nested. Nodes still open at `end`
or at EOF are implicitly closed there (truncation, timeout, hard kill). If the
file has no `end` line the viewer treats it as `timeout`. A final line that has
no terminating newline and is not valid JSON is ignored: the process was killed
mid-write. Any other unparseable line makes the whole trace invalid.

A `value` event whose `loc` is out of range or not an `expr` loc is malformed,
as is an anchored `value` event with no open block node and a named one
attached to an `expr` node. An `obj` event whose `id` is neither already
defined nor the next new id is malformed, as is a `value` event when a
reference in it, or in any `obj` event before it, names an id not defined
before it.

### Values

A value is either a primitive, written inline, or a reference to an object:

```json
{"kind": "number", "text": "42"}
{"kind": "string", "text": "'hello'"}
{"kind": "string", "text": "'aaaaaaaa…'", "length": 5000}
{"ref": 3}
```

A **primitive** has no identity: it is compared by what it shows.

- `kind` — `number` | `string` | `boolean` | `null`. The viewer uses it to style
  and chart values, never to parse them into another language's syntax.
- `text` — the value written as a literal of the source language, on one line.
- `length` — present only when `text` was shortened: the full value's length
  (a string's characters, a number's digits).

A **reference** `{"ref": id}` points at an object defined by `obj` events.

### Objects

```json
{"op": "obj", "id": 0, "kind": "sequence", "type": "list", "items": [{"kind": "number", "text": "1"}, {"ref": 1}]}
{"op": "obj", "id": 1, "kind": "sequence", "type": "list", "items": [], "length": 30}
{"op": "obj", "id": 2, "kind": "mapping", "type": "dict", "entries": [[{"kind": "string", "text": "'a'"}, {"ref": 0}]]}
{"op": "obj", "id": 3, "kind": "record", "type": "Point", "text": "Point(x=1, y=2)", "fields": [["x", {"kind": "number", "text": "1"}], ["y", {"kind": "number", "text": "2"}]]}
{"op": "obj", "id": 4, "kind": "opaque", "type": "function", "text": "<function helper>"}
```

An object has an identity, which `id` names: two references with the same id
are the same object (`a = b = []`), and an object may reach itself. Ids are
assigned in order of first definition, starting at 0, and never reused for
another object.

- `kind` — how the object is laid out:
  - `sequence` — `items`, ordered and indexed from 0.
  - `set` — `items`, unordered.
  - `mapping` — `entries`, key and value pairs.
  - `record` — `fields`, name and value pairs.
  - `opaque` — nothing to open; `text` stands for it.
- `type` — the object's type name as the language writes it.
- `text` — optional; the object's own one-line rendering, when the language
  gives it one beyond its structure (Python: a custom `__repr__`). Required on
  `opaque` objects.
- `length` — present only when some items, entries or fields were left out:
  the full count. Those written are the first ones, in the language's order.
  The tracer keeps a bounded amount of each value, so an object it stopped
  opening is written with none and its `length`.

An object may be defined more than once, because its state changes. A
reference in a `value` event resolves to the object's latest definition before
that event, and references inside that definition resolve the same way,
relative to the same `value` event. Before each `value` event the tracer
defines every object reachable from it that is new or has changed since its
latest definition, so a `value` event shows the objects as they were at that
moment while an unchanged object is written only once. Definitions may refer
forward to ids defined later in the same run of `obj` events, which is how
cycles are written.

Python writes exact `int`, `float` and `complex` values as `number`, `str` and
`bytes` as `string`, `bool` as `boolean` and `None` as `null`; a subclass
instance is an object. Lists and tuples are sequences, except named tuples,
which are records of their fields; sets and frozensets are sets; dicts are
mappings; each includes its subclasses. Other instances are records of their
instance attributes (`__dict__` and `__slots__`). Functions, classes, modules,
iterators and generators are opaque: the tracer never iterates an object to
look inside it, and runs a custom `__repr__` with recording paused, so it
cannot change the trace. Memory addresses are stripped from every `text`, so
traces are deterministic.

### What is _not_ recorded

- `expr` nodes with nothing inside them (no block, no output, no non-empty
  descendant) are never written. Absence of an `expr` node says nothing about
  whether the expression ran; use `stmt` nodes for that.
  Locs are a static table, however, so an `expr` loc may exist only as an anchor
  for values and never be entered as a node.
- Values are recorded for block inputs and for the statements that change a
  block's watched variables. Other expression values are not recorded, and
  objects are recorded only as far as these values reach them, within the
  tracer's limits.

## Derived views

**Output window** — all `out` events concatenated in file order. Each chunk
remembers its node, so clicking output resolves to a path from the root.

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

**Raised exceptions in a window** for block node _B_ — every `stmt` child of _B_
with `exc` (caught in _B_), plus _B_'s last `stmt` child when _B_ has `exc` and
the last block under that statement does not (raised in _B_ rather than passed
through it).

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
