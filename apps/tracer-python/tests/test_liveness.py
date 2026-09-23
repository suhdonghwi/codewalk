import ast
import symtable

import pytest

from codewalk.liveness import (
    function_scope,
    live_after_loops,
    loop_assigns,
    loop_state,
)


@pytest.mark.parametrize(
    ("source", "state"),
    [
        ("while lo < hi:\n    mid = lo + hi\n    lo = mid\n", ["lo", "hi"]),
        ("for x in xs:\n    if x:\n        y = x\n    use(y)\n", ["use", "y"]),
        (
            "for x in xs:\n    if x:\n        y = 1\n    else:\n        y = 2\n    y\n",
            [],
        ),
        (
            "for x in xs:\n    if x:\n        continue\n    else:\n        y = 1\n"
            "    y\n",
            [],
        ),
        ("while (line := read()) != end:\n    line\n", ["read", "end"]),
        (
            "for x in xs:\n    try:\n        y = f()\n    except E:\n        pass\n"
            "    y\n",
            ["f", "E", "y"],
        ),
        ("for x in xs:\n    for y in ys:\n        s = y\n    s\n", ["ys", "s"]),
        ("for x in xs:\n    total += x\n", ["total"]),
        (
            "for x in xs:\n    [x * k for x in xs]\n    lambda q: q + w\n",
            ["xs", "k", "w"],
        ),
    ],
)
def test_loop_state_is_what_an_iteration_may_read_before_assigning(
    source: str, state: list[str]
) -> None:
    loop = ast.parse(source).body[0]
    assert isinstance(loop, (ast.For, ast.While))

    assert loop_state(loop) == state


@pytest.mark.parametrize(
    ("source", "assigns"),
    [
        ("while (line := read()) != end:\n    count += 1\n", {"line", "count"}),
        ("for x in xs:\n    items[x] = x\n    seen.add(x)\n", set()),
        ("for x in xs:\n    def f():\n        total = x\n", {"f"}),
        (
            "for x in xs:\n    try:\n        pass\n    except E as err:\n"
            "        del y\n",
            {"err", "y"},
        ),
    ],
)
def test_loop_assigns_only_rebinding_in_the_enclosing_scope(
    source: str, assigns: set[str]
) -> None:
    loop = ast.parse(source).body[0]
    assert isinstance(loop, (ast.For, ast.While))

    assert loop_assigns(loop) == assigns


@pytest.mark.parametrize(
    ("source", "line", "live"),
    [
        (
            "def f():\n    queue = [1]\n    while queue:\n"
            "        node = queue.pop()\n        if node:\n            return node\n"
            "    return None\n",
            3,
            set(),
        ),
        (
            "for row in rows:\n    if best:\n        use(best)\n    for x in row:\n"
            "        best = x\n        tmp = x\n",
            4,
            {"best", "use"},
        ),
        (
            "for x in xs:\n    total = x\ntry:\n    risky()\nexcept E:\n"
            "    print(total)\n",
            1,
            {"risky", "E", "print", "total"},
        ),
        (
            "def fill(out, n):\n    while n:\n        out.append(n)\n        n -= 1\n",
            2,
            {"out"},
        ),
        (
            "def fill():\n    for x in range(3):\n        results.append(x)\n",
            2,
            {"range", "results"},
        ),
        (
            "def f(xs):\n    for x in xs:\n        i = x\n        total = x\n"
            "    def g():\n        i = 0\n        return i + total\n    return g\n",
            2,
            {"xs", "total"},
        ),
        (
            "for x in xs:\n    table = x\ndef lookup():\n    return table\nlookup()\n",
            1,
            {"table"},
        ),
        ("for x in xs:\n    y = x\nprint(locals())\n", 1, None),
    ],
)
def test_live_after_a_loop_is_what_later_code_or_the_caller_may_read(
    source: str, line: int, live: set[str] | None
) -> None:
    tree = ast.parse(source)
    module = symtable.symtable(source, "test.py", "exec")
    first = tree.body[0]
    if isinstance(first, ast.FunctionDef):
        body, scope = first.body, function_scope(module, first)
    else:
        body, scope = tree.body, module
    assert scope is not None

    after = live_after_loops(body, scope)

    assert next(
        (names for loop, names in after.items() if loop.lineno == line), None
    ) == (None if live is None else frozenset(live))
