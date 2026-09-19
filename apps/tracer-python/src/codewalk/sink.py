"""Destinations for trace events."""

import io
import json
from collections.abc import Mapping
from typing import Protocol, TextIO


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
        # `enter` and plain `exit` are nearly every event of a trace and have a
        # fixed shape, so they skip the general JSON encoder.
        op = event.get("op")
        if op == "enter":
            self._file.write(f'{{"op":"enter","loc":{event["loc"]}}}\n')
            return
        if op == "exit" and len(event) == 1:
            self._file.write('{"op":"exit"}\n')
            return
        line = json.dumps(dict(event), ensure_ascii=False, separators=(",", ":"))
        self._file.write(f"{line}\n")
        if op == "end":
            # The process may be killed without ever closing the sink (a program
            # that keeps looping after truncation); the last word must not be lost.
            self._file.flush()

    def flush(self) -> None:
        self._file.flush()

    def close(self) -> None:
        self._file.close()
