"""The open-node stack: what instrumented code calls while it runs."""

import io
import sys
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager, redirect_stderr, redirect_stdout
from types import (
    BuiltinFunctionType,
    FrameType,
    FunctionType,
    ModuleType,
    TracebackType,
)
from typing import Literal

from codewalk.instrument import StatementNames
from codewalk.sink import EventSink
from codewalk.values import Heap, Snapshot, snapshot

type Stream = Literal["stdout", "stderr"]

_WATCHED_CALLS = 1000

_NOT_STATE = (BuiltinFunctionType, FunctionType, ModuleType, type)


class _Node:
    __slots__ = ("block", "frame", "loc", "pending", "watched")

    def __init__(self, loc: int, *, block: bool, pending: bool) -> None:
        self.loc = loc
        self.block = block
        self.pending = pending
        self.frame: FrameType | None = None
        self.watched: dict[str, Snapshot] | None = None


class _BlockContext:
    __slots__ = ("_loc", "_node", "_repair", "_runtime")

    def __init__(self, runtime: "Runtime", loc: int, *, repair: bool) -> None:
        self._runtime = runtime
        self._loc = loc
        self._repair = repair
        self._node: _Node | None = None

    def __enter__(self) -> None:
        self._node = self._runtime._enter_block(
            self._loc, sys._getframe(1), repair=self._repair
        )

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        del exc_type, traceback
        self._runtime._exit_block(self._node, exc)
        return False


class Runtime:
    """Maintain the open-node stack and emit trace events."""

    def __init__(
        self,
        parents: Sequence[int | None],
        sink: EventSink,
        watched: Mapping[int, Sequence[str]],
        inputs: Mapping[int, Sequence[str]],
        statements: Mapping[int, StatementNames],
    ) -> None:
        self._parents = parents
        self._sink = sink
        self._watched = watched
        self._inputs = inputs
        self._statements = statements
        self._calls: dict[int, int] = {}
        self._stack: list[_Node] = []
        self._out_stream: Stream | None = None
        self._out_text = ""
        self._heap = Heap(self._emit)
        self._recent: dict[tuple[int, str], Snapshot] = {}
        # False once the trace has ended and while `render` runs user
        # formatting code; a plain attribute because it is read on every event.
        self._active = True
        self._exhausted = False

    def block(self, loc: int) -> _BlockContext:
        return _BlockContext(self, loc, repair=False)

    def iteration(self, loc: int) -> _BlockContext:
        return _BlockContext(self, loc, repair=True)

    def mark_exhausted(self) -> None:
        self._exhausted = True

    def take_exhausted(self) -> bool:
        exhausted = self._exhausted
        self._exhausted = False
        return exhausted

    def state(self, loc: int) -> None:
        block = self._innermost_block()
        if not self._active or block is None or block.watched is None:
            return
        for name in self._inputs[loc]:
            taken = block.watched.get(name)
            if taken is not None:
                self._emit_value("name", name, taken)

    def stmt(self, loc: int) -> None:
        if not self._active:
            return
        block = self._innermost_block()
        if block is not None:
            self._settle(block)
        self._open_statement(loc)

    def caught(self, loc: int) -> None:
        if not self._active:
            return
        block = self._innermost_block()
        if block is not None:
            exc = sys.exception()
            self._settle(block, interrupted=exc is not None)
            if exc is not None:
                self._interrupt(block, exc)
        self._open_statement(loc)

    def _open_statement(self, loc: int) -> None:
        self._repair(self._parents[loc])
        self._emit({"op": "enter", "loc": loc})
        self._stack.append(_Node(loc, block=False, pending=False))

    def begin(self, loc: int) -> int:
        if self._active:
            self._repair(self._parents[loc])
            self._stack.append(_Node(loc, block=False, pending=True))
        return loc

    def end[T](self, loc: int, value: T) -> T:
        if not self._active:
            return value

        match = len(self._stack) - 1
        while match >= 0:
            node = self._stack[match]
            if node.block:
                return value
            if node.loc == loc:
                break
            match -= 1
        else:
            return value

        while len(self._stack) > match:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        return value

    def value(self, loc: int, value: object) -> None:
        if not self._active:
            return
        self._emit_value("loc", loc, self._snapshot((loc, ""), value))

    def returned[T](self, loc: int, value: T, literal: bool = False) -> T:
        if not self._active:
            return value
        self._repair(loc)
        block = self._innermost_block()
        stack = self._stack
        if (
            block is None
            or block.watched is None
            or stack[-1].block
            or stack[-1].loc != loc
        ):
            return value
        taken = self._snapshot((loc, ""), value)
        event = {"op": "return", "value": self._heap.define(taken)}
        self._emit(event | {"literal": True} if literal else event)
        return value

    def render[T, R](self, format_: Callable[[T], R], subject: T) -> R:
        active = self._active
        self._active = False
        try:
            return format_(subject)
        finally:
            self._active = active

    def out(self, stream: Stream, text: str) -> None:
        if not self._active or not self._stack:
            return
        self._materialize()
        if self._out_stream == stream:
            self._out_text += text
            return
        self._flush_output()
        self._out_stream = stream
        self._out_text = text

    @contextmanager
    def capture_output(self) -> Iterator[None]:
        with (
            redirect_stdout(_CaptureStream(self.out, "stdout")),
            redirect_stderr(_CaptureStream(self.out, "stderr")),
        ):
            yield

    def finish(self, status: str, **fields: object) -> None:
        if not self._active:
            return
        self._flush_output()
        while self._stack:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        self._emit({"op": "end", "status": status, **fields})
        self._active = False

    def _enter_block(self, loc: int, frame: FrameType, *, repair: bool) -> _Node | None:
        if not self._active:
            return None
        if repair:
            self._repair(self._parents[loc])
        self._materialize()
        self._emit({"op": "enter", "loc": loc})
        node = _Node(loc, block=True, pending=False)
        self._stack.append(node)
        if not repair:
            self._calls[loc] = self._calls.get(loc, 0) + 1
        if repair or self._calls[loc] <= _WATCHED_CALLS:
            node.frame = frame
            node.watched = self._variables(loc, frame)
        return node

    def _exit_block(self, target: _Node | None, exc: BaseException | None) -> None:
        if not self._active or target is None:
            return
        self._settle(target, interrupted=exc is not None)
        while self._stack:
            node = self._stack.pop()
            if node is target:
                if exc is None:
                    self._emit({"op": "exit"})
                else:
                    summary = self.render(_exception_summary, exc)
                    self._emit({"op": "exit", "exc": summary})
                return
            if not node.pending:
                self._emit({"op": "exit"})

    def _innermost_block(self) -> _Node | None:
        for node in reversed(self._stack):
            if node.block:
                return node
        return None

    def _variables(self, block: int, frame: FrameType) -> dict[str, Snapshot]:
        variables: dict[str, Snapshot] = {}
        for name in self._watched.get(block, ()):
            found, value = _lookup(frame, name)
            if found and not isinstance(value, _NOT_STATE):
                variables[name] = self._snapshot((block, name), value)
        return variables

    def _snapshot(self, key: tuple[int, str], value: object) -> Snapshot:
        previous = self._recent.get(key)
        taken = self.render(lambda item: snapshot(item, previous), value)
        self._recent[key] = taken
        return taken

    def _emit_value(
        self, anchor: str, key: object, taken: Snapshot, *, literal: bool = False
    ) -> None:
        event = {"op": "value", anchor: key, "value": self._heap.define(taken)}
        self._emit(event | {"literal": True} if literal else event)

    def _settle(self, block: _Node, *, interrupted: bool = False) -> None:
        # Records what the block's open statement assigned or changed, as
        # values on that statement, before the statement closes.
        stack = self._stack
        watched = block.watched
        if watched is None or block.frame is None:
            return
        index = len(stack) - 1
        while index >= 0 and stack[index] is not block:
            index -= 1
        index += 1
        if index == 0 or index >= len(stack) or stack[index].block:
            return
        while len(stack) > index + 1:
            node = stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        names = self._statements.get(stack[index].loc)
        binds = () if names is None or interrupted else names.binds
        literal = () if names is None or interrupted else names.literal
        quiet = () if names is None else names.quiet
        live = None if names is None else names.live
        current = self._variables(block.loc, block.frame)
        for name, taken in current.items():
            if live is not None and name not in live:
                continue
            if (name in binds or watched.get(name) != taken) and (
                name in binds or name not in quiet
            ):
                self._emit_value("name", name, taken, literal=name in literal)
        block.watched = current

    def _interrupt(self, block: _Node, exc: BaseException) -> None:
        stack = self._stack
        index = len(stack) - 1
        while index >= 0 and stack[index] is not block:
            index -= 1
        statement = index + 1
        if index < 0 or statement >= len(stack) or stack[statement].block:
            return
        while len(stack) > statement + 1:
            node = stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        stack.pop()
        self._emit({"op": "exit", "exc": self.render(_exception_summary, exc)})

    def _repair(self, parent: int | None) -> None:
        while self._stack:
            node = self._stack[-1]
            if node.loc == parent or node.block:
                return
            self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})

    def _materialize(self) -> None:
        # Pending nodes are always a suffix of the stack; scanning only that
        # suffix keeps output and calls cheap under deep recursion.
        stack = self._stack
        first = len(stack)
        while first > 0 and stack[first - 1].pending:
            first -= 1
        for node in stack[first:]:
            self._emit({"op": "enter", "loc": node.loc})
            node.pending = False

    def _emit(self, event: Mapping[str, object]) -> None:
        self._flush_output()
        self._sink.write(event)

    def _flush_output(self) -> None:
        stream = self._out_stream
        if stream is None:
            return
        text = self._out_text
        self._out_stream = None
        self._out_text = ""
        self._sink.write({"op": "out", "stream": stream, "text": text})


class _CaptureStream(io.TextIOBase):
    __slots__ = ("_stream", "_write")

    def __init__(self, write: Callable[[Stream, str], None], stream: Stream) -> None:
        self._write = write
        self._stream: Stream = stream

    def write(self, text: str) -> int:
        self._write(self._stream, text)
        return len(text)


def _lookup(frame: FrameType, name: str) -> tuple[bool, object]:
    try:
        return True, frame.f_locals[name]
    except KeyError:
        pass
    try:
        return True, frame.f_globals[name]
    except KeyError:
        return False, None


def _exception_summary(exc: BaseException) -> str:
    name = type(exc).__name__
    try:
        message = str(exc)
    except BaseException:
        return name
    if not message:
        return name
    first_line = message.splitlines()[0]
    if not first_line:
        return name
    return f"{name}: {first_line}"[:200]
