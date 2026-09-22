"""The open-node stack: what instrumented code calls while it runs."""

import reprlib
from collections.abc import Mapping, Sequence
from types import TracebackType
from typing import Literal

from codewalk.capture import OutputCapture, Stream
from codewalk.sink import EventSink

_VALUE_MAX_LEVEL = 2
_VALUE_MAX_ITEMS = 6
_VALUE_MAX_STRING = 40
_VALUE_MAX_OTHER = 40
_VALUE_TEXT_LIMIT = 80
_VALUE_FILL = "…"


class _ValueRepr(reprlib.Repr):
    def repr_instance(self, x: object, level: int) -> str:
        if type(x).__repr__ is object.__repr__:
            return f"<{type(x).__name__}>"
        try:
            text = repr(x)
        except Exception:
            return f"<{type(x).__name__}>"
        if len(text) > self.maxother:
            head = (self.maxother - len(self.fillvalue)) // 2
            tail = self.maxother - len(self.fillvalue) - head
            return f"{text[:head]}{self.fillvalue}{text[-tail:]}"
        return text


class ExecutionStopped(BaseException):
    """Raised inside the traced program to end it: time limit or truncation."""

    def __init__(self, status: str) -> None:
        super().__init__(status)
        self.status = status


class _Node:
    __slots__ = ("block", "loc", "pending")

    def __init__(self, loc: int, *, block: bool, pending: bool) -> None:
        self.loc = loc
        self.block = block
        self.pending = pending


class _BlockContext:
    __slots__ = ("_entries", "_loc", "_node", "_repair", "_runtime")

    def __init__(
        self,
        runtime: "Runtime",
        loc: int,
        entries: tuple[tuple[int, object], ...],
        *,
        repair: bool,
    ) -> None:
        self._runtime = runtime
        self._loc = loc
        self._entries = entries
        self._repair = repair
        self._node: _Node | None = None

    def __enter__(self) -> None:
        self._node = self._runtime._enter_block(self._loc, repair=self._repair)
        if self._node is not None:
            for loc, value in self._entries:
                self._runtime._emit_value(loc, value)

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
        *,
        max_events: int,
    ) -> None:
        self._parents = parents
        self._sink = sink
        self._max_events = max_events
        self._event_count = 0
        self._stack: list[_Node] = []
        self._out_stream: Stream | None = None
        self._out_text = ""
        self._truncated = False
        # False once the trace has ended (finished or truncated); a plain
        # attribute because it is read several times per event.
        self._active = True
        self._muted = False
        self._stop: str | None = None
        self._exhausted = False

    @property
    def truncated(self) -> bool:
        return self._truncated

    def block(self, loc: int, *entries: tuple[int, object]) -> _BlockContext:
        return _BlockContext(self, loc, entries, repair=False)

    def iteration(self, loc: int, *entries: tuple[int, object]) -> _BlockContext:
        return _BlockContext(self, loc, entries, repair=True)

    def mark_exhausted(self) -> None:
        self._exhausted = True

    def take_exhausted(self) -> bool:
        exhausted = self._exhausted
        self._exhausted = False
        return exhausted

    def request_stop(self, status: str) -> None:
        """Make every following statement marker raise `ExecutionStopped`.

        A single asynchronous raise can be swallowed by the program's own bare
        `except:`. Markers sit before each statement, including the `try`
        itself and the statements of its handlers, so raising from all of them
        gets out within a statement or two.
        """
        self._stop = status

    def stmt(self, loc: int) -> None:
        if self._stop is not None:
            raise ExecutionStopped(self._stop)
        if not self._recording:
            return
        self._repair(self._parents[loc])
        if self._recording and self._emit({"op": "enter", "loc": loc}):
            self._stack.append(_Node(loc, block=False, pending=False))

    def begin(self, loc: int) -> int:
        if self._recording:
            self._repair(self._parents[loc])
            if self._recording:
                self._stack.append(_Node(loc, block=False, pending=True))
        return loc

    def end[T](self, loc: int, value: T) -> T:
        if not self._recording:
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

        while self._recording and len(self._stack) > match:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        return value

    def _emit_value(self, loc: int, value: object) -> None:
        if not self._recording or not self._stack:
            return
        self._materialize()
        if not self._recording or not self._stack:
            return
        self._muted = True
        try:
            text = _format_value(value)
        finally:
            self._muted = False
        if self._recording and self._stack:
            self._emit({"op": "value", "loc": loc, "text": text})

    def out(self, stream: Stream, text: str) -> None:
        if not self._recording or not self._stack:
            return
        self._materialize()
        if not self._recording or not self._stack:
            return
        if self._out_stream == stream:
            self._out_text += text
            return
        self._flush_output()
        if self._recording:
            self._out_stream = stream
            self._out_text = text

    def capture_output(self) -> OutputCapture:
        return OutputCapture(self.out)

    def finish(self, status: str, **fields: object) -> None:
        if not self._recording:
            return
        self._flush_output()
        while self._recording and self._stack:
            node = self._stack.pop()
            if not node.pending:
                self._emit({"op": "exit"})
        if not self._recording:
            return
        event: dict[str, object] = {"op": "end", "status": status}
        event.update(fields)
        if self._emit(event):
            self._active = False

    def _enter_block(self, loc: int, *, repair: bool) -> _Node | None:
        if not self._recording:
            return None
        if repair:
            self._repair(self._parents[loc])
        self._materialize()
        if not self._recording or not self._emit({"op": "enter", "loc": loc}):
            return None
        node = _Node(loc, block=True, pending=False)
        self._stack.append(node)
        return node

    def _exit_block(self, target: _Node | None, exc: BaseException | None) -> None:
        if not self._recording or target is None:
            return
        while self._recording and self._stack:
            node = self._stack.pop()
            if node is target:
                if exc is None or isinstance(exc, ExecutionStopped):
                    self._emit({"op": "exit"})
                else:
                    self._emit({"op": "exit", "exc": _exception_summary(exc)})
                return
            if not node.pending:
                self._emit({"op": "exit"})

    def _repair(self, parent: int | None) -> None:
        while self._recording and self._stack:
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
        if not self._recording:
            return False
        self._flush_output()
        if not self._recording:
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
        if not self._recording:
            return False
        if self._event_count >= self._max_events:
            self._sink.write({"op": "end", "status": "truncated"})
            self._truncated = True
            self._active = False
            self._stop = "truncated"
            self._stack.clear()
            self._out_stream = None
            self._out_text = ""
            return False
        self._sink.write(event)
        self._event_count += 1
        return True

    @property
    def _recording(self) -> bool:
        return self._active and not self._muted


def _format_value(value: object) -> str:
    try:
        text = _ValueRepr(
            maxlevel=_VALUE_MAX_LEVEL,
            maxlist=_VALUE_MAX_ITEMS,
            maxtuple=_VALUE_MAX_ITEMS,
            maxset=_VALUE_MAX_ITEMS,
            maxdict=_VALUE_MAX_ITEMS,
            maxstring=_VALUE_MAX_STRING,
            maxother=_VALUE_MAX_OTHER,
            fillvalue=_VALUE_FILL,
        ).repr(value)
    except Exception:
        text = f"<{type(value).__name__}>"
    text = text.replace("\r\n", " ").replace("\r", " ").replace("\n", " ")
    if len(text) > _VALUE_TEXT_LIMIT:
        return f"{text[: _VALUE_TEXT_LIMIT - len(_VALUE_FILL)]}{_VALUE_FILL}"
    return text


def _exception_summary(exc: BaseException) -> str:
    name = type(exc).__name__
    message = str(exc)
    if not message:
        return name
    first_line = message.splitlines()[0]
    if not first_line:
        return name
    return f"{name}: {first_line}"[:200]
