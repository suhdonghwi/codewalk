import json
import os
from collections.abc import Mapping
from contextlib import suppress
from pathlib import Path

import pytest

from codewalk.runtime import ExecutionStopped, Runtime
from codewalk.sink import JsonlSink


class ListSink:
    def __init__(self) -> None:
        self.events: list[dict[str, object]] = []

    def write(self, event: Mapping[str, object]) -> None:
        self.events.append(dict(event))


def test_hand_instrumented_factorial_matches_the_golden_trace() -> None:
    fixture = Path(__file__).parents[3] / "spec/fixtures/fact.trace.jsonl"
    lines = fixture.read_text(encoding="utf-8").splitlines()
    header = json.loads(lines[0])
    expected = [json.loads(line) for line in lines[1:]]
    parents = [loc["parent"] for loc in header["locs"]]
    sink = ListSink()
    runtime = Runtime(parents, sink, max_events=1_000)
    begin = runtime.begin
    end = runtime.end

    with runtime.capture_output(), runtime.block(0):
        runtime.stmt(1)

        def fact(n: int) -> int:
            with runtime.block(2):
                runtime.stmt(3)
                end(begin(4), print("fact", n))
                runtime.stmt(5)
                if end(begin(6), n <= 1):
                    runtime.stmt(7)
                    return 1
                runtime.stmt(8)
                return end(
                    begin(9),
                    n * end(begin(10), fact(end(begin(11), n - 1))),
                )

        runtime.stmt(12)
        for i in end(begin(13), range(2)):
            with runtime.iteration(14):
                runtime.stmt(15)
                end(begin(16), print(end(begin(17), fact(end(begin(18), i + 1)))))

    runtime.finish("ok")

    assert sink.events == expected


def test_a_caught_nested_expression_exception_leaves_no_stale_node() -> None:
    parents = [None, 0, 1, 2, 3, 4, 5, 3, 7, 8, 9]
    sink = ListSink()
    runtime = Runtime(parents, sink, max_events=100)

    def helper() -> None:
        with runtime.block(9):
            runtime.stmt(10)

    def run() -> None:
        with runtime.block(3):
            runtime.stmt(4)
            with suppress(ZeroDivisionError):
                runtime.end(
                    runtime.begin(5),
                    1 / runtime.end(runtime.begin(6), 0),
                )
            runtime.stmt(7)
            runtime.end(runtime.begin(8), helper())

    with runtime.block(0):
        runtime.stmt(1)
        runtime.end(runtime.begin(2), run())
    runtime.finish("ok")

    assert sink.events == [
        {"op": "enter", "loc": 0},
        {"op": "enter", "loc": 1},
        {"op": "enter", "loc": 2},
        {"op": "enter", "loc": 3},
        {"op": "enter", "loc": 4},
        {"op": "exit"},
        {"op": "enter", "loc": 7},
        {"op": "enter", "loc": 8},
        {"op": "enter", "loc": 9},
        {"op": "enter", "loc": 10},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "end", "status": "ok"},
    ]


def test_abrupt_control_flow_closes_iterations_and_their_children() -> None:
    parents = [None, 0, 1, 2, 0, 4, 5, 6, 7]
    sink = ListSink()
    runtime = Runtime(parents, sink, max_events=100)

    def stop() -> int:
        with runtime.block(5):
            runtime.stmt(6)
            for _ in range(1):
                with runtime.iteration(7):
                    runtime.stmt(8)
                    return 9
        raise AssertionError("unreachable")

    with runtime.block(0):
        runtime.stmt(1)
        for i in range(3):
            with runtime.iteration(2):
                runtime.stmt(3)
                if i == 0:
                    continue
                break
        runtime.stmt(4)
        result = stop()
    runtime.finish("ok")

    assert result == 9
    assert sink.events == [
        {"op": "enter", "loc": 0},
        {"op": "enter", "loc": 1},
        {"op": "enter", "loc": 2},
        {"op": "enter", "loc": 3},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "enter", "loc": 2},
        {"op": "enter", "loc": 3},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "enter", "loc": 4},
        {"op": "enter", "loc": 5},
        {"op": "enter", "loc": 6},
        {"op": "enter", "loc": 7},
        {"op": "enter", "loc": 8},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "end", "status": "ok"},
    ]


def test_a_propagating_exception_marks_each_block_until_it_is_caught() -> None:
    parents = [None, 0, 1, 2, 3, 4, 5, 6, 0]
    sink = ListSink()
    runtime = Runtime(parents, sink, max_events=100)

    def inner() -> None:
        with runtime.block(6):
            runtime.stmt(7)
            raise ValueError("bad\nignored")

    def outer() -> None:
        with runtime.block(3):
            runtime.stmt(4)
            runtime.end(runtime.begin(5), inner())

    with runtime.block(0):
        runtime.stmt(1)
        try:
            runtime.end(runtime.begin(2), outer())
        except ValueError:
            runtime.stmt(8)
    runtime.finish("ok")

    assert sink.events == [
        {"op": "enter", "loc": 0},
        {"op": "enter", "loc": 1},
        {"op": "enter", "loc": 2},
        {"op": "enter", "loc": 3},
        {"op": "enter", "loc": 4},
        {"op": "enter", "loc": 5},
        {"op": "enter", "loc": 6},
        {"op": "enter", "loc": 7},
        {"op": "exit"},
        {"op": "exit", "exc": "ValueError: bad"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit", "exc": "ValueError: bad"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "enter", "loc": 8},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "end", "status": "ok"},
    ]


def test_repair_stops_at_a_block_when_the_static_parent_is_not_open() -> None:
    parents = [None, 0, 1, 1]
    sink = ListSink()
    runtime = Runtime(parents, sink, max_events=100)

    with runtime.block(0):
        runtime.stmt(1)
        with runtime.block(2):
            loc = runtime.begin(3)
            runtime.out("stdout", "inside")
            runtime.end(loc, None)
    runtime.finish("ok")

    assert sink.events == [
        {"op": "enter", "loc": 0},
        {"op": "enter", "loc": 1},
        {"op": "enter", "loc": 2},
        {"op": "enter", "loc": 3},
        {"op": "out", "stream": "stdout", "text": "inside"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "exit"},
        {"op": "end", "status": "ok"},
    ]


def test_truncation_ends_the_trace_at_the_limit_and_stops_at_the_next_statement() -> (
    None
):
    sink = ListSink()
    runtime = Runtime([None, 0, 1], sink, max_events=3)

    with runtime.block(0):
        runtime.stmt(1)
        loc = runtime.begin(2)
        runtime.out("stdout", "too much")
        result = runtime.end(loc, 42)
        with pytest.raises(ExecutionStopped):
            runtime.stmt(1)
    runtime.finish("ok")

    assert result == 42
    assert runtime.truncated
    assert sink.events == [
        {"op": "enter", "loc": 0},
        {"op": "enter", "loc": 1},
        {"op": "enter", "loc": 2},
        {"op": "end", "status": "truncated"},
    ]


def test_jsonl_sink_writes_compact_utf8_and_flushes_at_the_end_event() -> None:
    read_fd, write_fd = os.pipe()
    os.set_blocking(read_fd, False)  # an unflushed sink must fail, not hang
    sink = JsonlSink.from_fd(write_fd)
    try:
        sink.write({"op": "out", "stream": "stdout", "text": "hé\n"})
        sink.write({"op": "end", "status": "truncated"})
        contents = os.read(read_fd, 1_000).decode()
    finally:
        sink.close()
        os.close(read_fd)

    assert contents == (
        '{"op":"out","stream":"stdout","text":"hé\\n"}\n'
        '{"op":"end","status":"truncated"}\n'
    )
