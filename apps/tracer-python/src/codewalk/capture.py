"""Redirect the program's stdout and stderr into the trace."""

import io
import sys
from collections.abc import Callable
from types import TracebackType
from typing import Literal, TextIO

type Stream = Literal["stdout", "stderr"]
type OutputWriter = Callable[[Stream, str], None]


class _CaptureStream(io.TextIOBase):
    __slots__ = ("_stream", "_write")

    def __init__(self, write: OutputWriter, stream: Stream) -> None:
        self._write = write
        self._stream: Stream = stream

    def write(self, text: str) -> int:
        self._write(self._stream, text)
        return len(text)

    def flush(self) -> None:
        pass

    def isatty(self) -> bool:
        return False


class OutputCapture:
    """Context manager that swaps `sys.stdout`/`sys.stderr` and restores them."""

    __slots__ = ("_stderr", "_stdout", "_write")

    def __init__(self, write: OutputWriter) -> None:
        self._write = write
        self._stdout: TextIO | None = None
        self._stderr: TextIO | None = None

    def __enter__(self) -> None:
        self._stdout = sys.stdout
        self._stderr = sys.stderr
        sys.stdout = _CaptureStream(self._write, "stdout")
        sys.stderr = _CaptureStream(self._write, "stderr")

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
