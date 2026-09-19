"""In-process trace event runtime for instrumented Python programs."""

import io
import json
import sys
from collections.abc import Mapping, Sequence
from types import TracebackType
from typing import Literal, Protocol, TextIO


class EventSink(Protocol):
    """Destination for trace events."""

    def write(self, event: Mapping[str, object]) -> None: ...


class JsonlSink:
    """Write trace events as compact UTF-8 JSON Lines."""

    def __init__(self, file: TextIO) -> None:
        self._file = file

    @classmethod
    def from_fd(cls, fd: int) -> "JsonlSink":
        file = io.TextIOWrapper(
            io.FileIO(fd, "w", closefd=True), encoding="utf-8", newline="\n"
        )
        return cls(file)

    def write(self, event: Mapping[str, object]) -> None:
        line = json.dumps(dict(event), ensure_ascii=False, separators=(",", ":"))
        self._file.write(f"{line}\n")
        if event.get("op") == "end":
            # The process may be killed without ever closing the sink (a program
            # that keeps looping after truncation); the last word must not be lost.
            self._file.flush()

    def close(self) -> None:
        self._file.close()


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


class _CaptureStream(io.TextIOBase):
    __slots__ = ("_runtime", "_stream")

    def __init__(self, runtime: "Runtime", stream: Literal["stdout", "stderr"]) -> None:
        self._runtime = runtime
        self._stream = stream

    def write(self, text: str) -> int:
        self._runtime.out(self._stream, text)
        return len(text)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


class _OutputContext:
    __slots__ = ("_runtime", "_stderr", "_stdout")

    def __init__(self, runtime: "Runtime") -> None:
        self._runtime = runtime
        self._stdout: TextIO | None = None
        self._stderr: TextIO | None = None

    def __enter__(self) -> None:
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        sys.stdout = _CaptureStream(self._runtime, "stdout")
        sys.stderr = _CaptureStream(self._runtime, "stderr")

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        traceback: TracebackType | None,
    ) -> Literal[False]:
        del exc_type, exc, traceback
        if self._stdout is not None:
            sys.stdout = self._stdout
        if self._stderr is not None:
            sys.stderr = self._stderr
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
        self._out_stream: Literal["stdout", "stderr"] | None = None
        self._out_text = ""
        self._truncated = False
        self._finished = False

    @property
    def truncated(self) -> bool:
        return self._truncated

    def block(self, loc: int) -> _BlockContext:
        return _BlockContext(self, loc, repair=False)

    def iteration(self, loc: int) -> _BlockContext:
        return _BlockContext(self, loc, repair=True)

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

    def out(self, stream: Literal["stdout", "stderr"], text: str) -> None:
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

    def capture_output(self) -> _OutputContext:
        return _OutputContext(self)

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
            self._finished = True

    @property
    def _active(self) -> bool:
        return not self._truncated and not self._finished

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
                    self._emit({"op": "exit", "exc": _exception_summary(exc)})
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
        if self._event_count >= self._max_events:
            self._sink.write({"op": "end", "status": "truncated"})
            self._truncated = True
            self._stack.clear()
            self._out_stream = None
            self._out_text = ""
            return False
        self._sink.write(event)
        self._event_count += 1
        return True


def _exception_summary(exc: BaseException) -> str:
    name = type(exc).__name__
    message = str(exc)
    if not message:
        return name
    first_line = message.splitlines()[0]
    if not first_line:
        return name
    return f"{name}: {first_line}"[:200]
