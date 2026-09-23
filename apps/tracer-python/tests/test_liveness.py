import ast

import pytest

from codewalk.liveness import loop_state


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

    assert [name.id for name in loop_state(loop)] == state
