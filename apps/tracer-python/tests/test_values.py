from collections.abc import Mapping

import pytest

from codewalk.values import Heap, snapshot


def _define(value: object) -> tuple[dict[str, object], list[dict[str, object]]]:
    events: list[dict[str, object]] = []

    def emit(event: Mapping[str, object]) -> None:
        events.append(dict(event))

    root = Heap(emit).define(snapshot(value))
    return root, events


def test_long_text_is_cut_to_one_line_and_keeps_its_full_length() -> None:
    class Multiline:
        def __repr__(self) -> str:
            return "first\r\nsecond\nthird\rfourth" + "x" * 500

    root, events = _define(["a" * 1000, 10**1000, -(10**300), 10**190, Multiline()])

    items = events[0]["items"]
    assert isinstance(items, list)
    text, huge, negative, whole = items[:4]
    assert text["text"] == f"'{'a' * 200}…'"
    assert text["length"] == 1000
    assert huge["text"] == f"1{'0' * 199}…"
    assert huge["length"] == 1001
    assert negative["text"] == f"-1{'0' * 199}…"
    assert negative["length"] == 301
    assert whole == {"kind": "number", "text": f"1{'0' * 190}"}
    assert root == {"ref": 0}
    record_text = events[1]["text"]
    assert isinstance(record_text, str)
    assert record_text.startswith("first second third fourth")
    assert len(record_text) == 200


@pytest.mark.parametrize("error", [ValueError, SystemExit])
def test_a_raising_repr_leaves_structure_without_text(
    error: type[BaseException],
) -> None:
    class Broken:
        def __repr__(self) -> str:
            raise error("broken")

    item = Broken()
    item.size = 1  # type: ignore[attr-defined]

    _, events = _define([item])

    assert events[1] == {
        "op": "obj",
        "id": 1,
        "kind": "record",
        "type": "Broken",
        "fields": [["size", {"kind": "number", "text": "1"}]],
    }


def test_shared_and_cyclic_objects_keep_one_id_and_only_changes_are_redefined() -> None:
    events: list[dict[str, object]] = []
    heap = Heap(lambda event: events.append(dict(event)))
    shared: list[object] = []
    outer: list[object] = [shared, shared]
    outer.append(outer)

    heap.define(snapshot(outer))
    first = list(events)
    shared.append(1)
    heap.define(snapshot(outer))

    assert first == [
        {
            "op": "obj",
            "id": 0,
            "kind": "sequence",
            "type": "list",
            "items": [{"ref": 1}, {"ref": 1}, {"ref": 0}],
        },
        {"op": "obj", "id": 1, "kind": "sequence", "type": "list", "items": []},
    ]
    assert events[2:] == [
        {
            "op": "obj",
            "id": 1,
            "kind": "sequence",
            "type": "list",
            "items": [{"kind": "number", "text": "1"}],
        },
    ]


def test_objects_beyond_the_budget_are_defined_empty_with_their_length() -> None:
    grid = [[[row, column] for column in range(30)] for row in range(10)]

    _, events = _define(grid)

    defined = {event["id"] for event in events}
    references = {
        item["ref"]
        for event in events
        for item in event.get("items", [])  # type: ignore[union-attr]
        if "ref" in item
    }
    assert references <= defined
    assert len(events) == 311
    assert events[-1]["items"] == []
    assert events[-1]["length"] == 2


def test_a_reused_snapshot_still_sees_a_change_inside_an_unchanged_container() -> None:
    grid = [[0, 0], [0, 0]]
    before = snapshot(grid)
    unchanged = snapshot(grid, before)
    grid[1][0] = 1
    after = snapshot(grid, unchanged)

    assert unchanged == before
    assert after != unchanged
    assert after.entries[id(grid[1])].shape.items[0] == ("number", "1", None)
