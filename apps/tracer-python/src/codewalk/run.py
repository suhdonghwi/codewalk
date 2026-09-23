"""Execute one instrumented Python script and emit its trace."""

import ast
import linecache
import signal
import sys
import traceback
from pathlib import Path
from types import FrameType

from codewalk.instrument import instrument
from codewalk.locs import Loc, SourceMap
from codewalk.runtime import Runtime
from codewalk.sink import JsonlSink

_FLUSH_SECONDS = 0.1
_PACKAGE_DIRECTORY = Path(__file__).parent


def run(path: Path, *, trace_fd: int = 1) -> None:
    source = path.read_text(encoding="utf-8")
    source_name = path.name
    sink = JsonlSink.from_fd(trace_fd)

    try:
        tree = ast.parse(source, filename=source_name)
    except SyntaxError as error:
        start, end = SourceMap(source).syntax_range(error)
        sink.write(_header(source_name, source, []))
        sink.write(
            {
                "op": "end",
                "status": "syntax_error",
                "message": error.msg,
                "file": 0,
                "start": start,
                "end": end,
            }
        )
        return

    result = instrument(tree, source, source_name)
    code = compile(result.tree, source_name, "exec")
    sink.write(_header(source_name, source, result.locs))
    sink.flush()

    runtime = Runtime([loc["parent"] for loc in result.locs], sink)
    globals_: dict[str, object] = {
        "__name__": "__main__",
        "__file__": str(path),
        "__builtins__": __builtins__,
        "_cw": runtime,
        "_cw_b": runtime.begin,
        "_cw_e": runtime.end,
    }
    old_argv = sys.argv
    old_path = sys.path
    old_handler = signal.getsignal(signal.SIGALRM)
    sys.argv = [str(path)]
    sys.path = [str(path.resolve().parent), *sys.path[1:]]
    linecache.cache[source_name] = (
        len(source),
        None,
        source.splitlines(keepends=True),
        source_name,
    )

    def flush(signum: int, frame: FrameType | None) -> None:
        del signum, frame
        sink.flush()

    # The runner kills the process at its limits; flushing on a timer keeps
    # what was recorded until then.
    signal.signal(signal.SIGALRM, flush)
    signal.setitimer(signal.ITIMER_REAL, _FLUSH_SECONDS, _FLUSH_SECONDS)
    try:
        with runtime.capture_output():
            try:
                try:
                    exec(code, globals_)
                finally:
                    signal.setitimer(signal.ITIMER_REAL, 0)
            except SystemExit:
                runtime.finish("ok")
            except BaseException as error:
                rendered = runtime.render(_format_traceback, error)
                runtime.finish("exception", traceback=rendered)
            else:
                runtime.finish("ok")
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, old_handler)
        sys.argv = old_argv
        sys.path = old_path
        sink.flush()


def _header(source_name: str, source: str, locs: list[Loc]) -> dict[str, object]:
    return {
        "codewalk": 1,
        "sources": [{"file": source_name, "text": source}],
        "locs": locs,
    }


def _format_traceback(error: BaseException) -> str:
    formatted = traceback.TracebackException.from_exception(error)
    _filter_traceback(formatted)
    return "".join(formatted.format())


def _filter_traceback(formatted: traceback.TracebackException) -> None:
    formatted.stack = traceback.StackSummary.from_list(
        frame for frame in formatted.stack if not _is_package_file(frame.filename)
    )
    if formatted.__cause__ is not None:
        _filter_traceback(formatted.__cause__)
    if formatted.__context__ is not None:
        _filter_traceback(formatted.__context__)
    if formatted.exceptions is not None:
        for nested in formatted.exceptions:
            _filter_traceback(nested)


def _is_package_file(filename: str) -> bool:
    try:
        return Path(filename).resolve().is_relative_to(_PACKAGE_DIRECTORY)
    except OSError:
        return False
