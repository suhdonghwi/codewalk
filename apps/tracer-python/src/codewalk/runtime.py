"""The open-node stack: what instrumented code calls while it runs."""

import reprlib
from collections.abc import Callable, Mapping, Sequence
from types import TracebackType
from typing import Literal

from codewalk.capture import OutputCapture, Stream
from codewalk.sink import EventSink

_VALUE_TEXT_LIMIT = 48


class _ValueRepr(reprlib.Repr):
    def repr_instance(self, x: object, level: int) -> str:
        if type(x).__repr__ is object.__repr__:
            return f"<{type(x).__name__}>"
        try:
            text = repr(x)
        except BaseException:
            return f"<{type(x).__name__}>"
        if len(text) > self.maxother:
            head = (self.maxother - len(self.fillvalue)) // 2
            tail = self.maxother - len(self.fillvalue) - head
            return f"{text[:head]}{self.fillvalue}{text[-tail:]}"
        return text


_VALUE_REPR = _ValueRepr(
    maxlevel=2,
    maxlist=6,
    maxtuple=6,
    maxset=6,
    maxdict=6,
    maxstring=40,
    maxother=40,
    fillvalue="…",
)


class _Node:
    __slots__ = ("block", "loc", "pending")

    def __init__(self, loc: int, *, block: bool, pending: bool) -> None:
        self.loc = loc
        self.block = block
        self.pending = pending


class _BlockContext:
    __slots__ = ("_loc", "_node", "_repair", "_runtime")

    def __init__(self, runtime: "Runtime", loc: int, *, repair: bool) -> None:
        self._runtime = runtime
        self._loc = loc
        self._repair = repair
        self._node: _Node | None = None

    def __enter__(self) -> None:
        self._node = self._runtime._enter_block(self._loc, repair=self._repair)

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
    ) -> None:
        self._parents = parents
        self._sink = sink
        self._stack: list[_Node] = []
        self._out_stream: Stream | None = None
        self._out_text = ""
        # False once the trace has ended and while
        # `render` runs user formatting code; a plain attribute because it is
        # read several times per event.
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

    def stmt(self, loc: int) -> None:
        if not self._active:
            return
        self._repair(self._parents[loc])
        if self._active and self._emit({"op": "enter", "loc": loc}):
            self._stack.append(_Node(loc, block=False, pending=False))

    def begin(self, loc: int) -> int:
        if self._active:
            self._repair(self._parents[loc])
            if self._active:
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

        while self._active and len(self._stack) > match:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        return value

    def value(self, loc: int, value: object) -> None:
        if not self._active:
            return
        self._emit(
            {"op": "value", "loc": loc, "text": self.render(_format_value, value)}
        )

    def render[T](self, format_: Callable[[T], str], subject: T) -> str:
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
        if not self._active or not self._stack:
            return
        if self._out_stream == stream:
            self._out_text += text
            return
        self._flush_output()
        if self._active:
            self._out_stream = stream
            self._out_text = text

    def capture_output(self) -> OutputCapture:
        return OutputCapture(self.out)

    def finish(self, status: str, **fields: object) -> None:
        if not self._active:
            return
        self._flush_output()
        while self._active and self._stack:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        if not self._active:
            return
        event: dict[str, object] = {"op": "end", "status": status}
        event.update(fields)
        if self._emit(event):
            self._active = False

    def _enter_block(self, loc: int, *, repair: bool) -> _Node | None:
        if not self._active:
            return None
        if repair:
            self._repair(self._parents[loc])
        self._materialize()
        if not self._active or not self._emit({"op": "enter", "loc": loc}):
            return None
        node = _Node(loc, block=True, pending=False)
        self._stack.append(node)
        return node

    def _exit_block(self, target: _Node | None, exc: BaseException | None) -> None:
        if not self._active or target is None:
            return
        while self._active and self._stack:
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

    def _repair(self, parent: int | None) -> None:
        while self._active and self._stack:
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
            if not self._emit({"op": "enter", "loc": node.loc}):
                return
            node.pending = False

    def _emit(self, event: Mapping[str, object]) -> bool:
        if not self._active:
            return False
        self._flush_output()
        if not self._active:
            return False
        return self._write(event)

    def _flush_output(self) -> None:
        stream = self._out_stream
        if stream is None:
            return
        text = self._out_text
        self._out_stream = None
        self._out_text = ""
        self._write({"op": "out", "stream": stream, "text": text})

    def _write(self, event: Mapping[str, object]) -> bool:
        if not self._active:
            return False
        self._sink.write(event)
        return True


def _format_value(value: object) -> str:
    try:
        text = _VALUE_REPR.repr(value)
    except BaseException:
        text = f"<{type(value).__name__}>"
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    if len(text) > _VALUE_TEXT_LIMIT:
        return f"{text[: _VALUE_TEXT_LIMIT - 1]}…"
    return text


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
