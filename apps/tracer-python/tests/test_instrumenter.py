import ast
import json
import subprocess
import sys
import tokenize
from pathlib import Path

import pytest
from jsonschema.validators import validator_for

from codewalk.instrument import instrument

ROOT = Path(__file__).parents[3]
FIXTURES = ROOT / "spec/fixtures"
FIXTURE_SOURCES = sorted(FIXTURES.glob("*.py"))
SCHEMA = json.loads((ROOT / "spec/trace.schema.json").read_text(encoding="utf-8"))
HEADER_VALIDATOR = validator_for(SCHEMA)(SCHEMA["$defs"]["header"])
EVENT_VALIDATOR = validator_for(SCHEMA)(SCHEMA["$defs"]["event"])


def _stdin(path: Path) -> bytes | None:
    stdin_path = path.with_suffix(".stdin")
    return stdin_path.read_bytes() if stdin_path.exists() else None


def _trace(
    path: Path, *arguments: str, timeout: float = 5
) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(
        [sys.executable, "-m", "codewalk", "run", str(path), *arguments],
        cwd=ROOT,
        input=_stdin(path),
        capture_output=True,
        check=False,
        timeout=timeout,
    )


@pytest.mark.parametrize("source", FIXTURE_SOURCES, ids=lambda path: path.stem)
def test_each_fixture_matches_its_complete_trace(source: Path) -> None:
    result = _trace(source)

    assert result.returncode == 0
    assert result.stderr == b""
    assert result.stdout == source.with_suffix(".trace.jsonl").read_bytes()


@pytest.mark.parametrize("source", FIXTURE_SOURCES, ids=lambda path: path.stem)
def test_each_fixture_obeys_trace_tree_and_output_invariants(source: Path) -> None:
    lines = source.with_suffix(".trace.jsonl").read_text(encoding="utf-8").splitlines()
    header = json.loads(lines[0])
    events = [json.loads(line) for line in lines[1:]]
    HEADER_VALIDATOR.validate(header)
    for event in events:
        EVENT_VALIDATOR.validate(event)

    locs = header["locs"]
    stack: list[int] = []
    output: list[str] = []
    for event in events:
        if event["op"] == "enter":
            loc = event["loc"]
            role = locs[loc]["role"]
            if stack:
                parent_role = locs[stack[-1]]["role"]
                if role == "stmt":
                    assert parent_role == "block"
                elif role == "expr":
                    assert parent_role in {"stmt", "expr"}
                else:
                    assert parent_role in {"stmt", "expr"}
            else:
                assert role == "block"
            if role in {"stmt", "expr"} or locs[loc]["unit"] == "iteration":
                assert stack
                assert stack[-1] == locs[loc]["parent"]
            stack.append(loc)
        elif event["op"] == "exit":
            assert stack
            if "exc" in event:
                assert locs[stack[-1]]["role"] in {"block", "stmt"}
            stack.pop()
        elif event["op"] == "out":
            assert stack
            if event["stream"] == "stdout":
                output.append(event["text"])
        elif event["op"] == "value":
            assert stack
            if "loc" in event:
                assert locs[event["loc"]]["role"] == "expr"
                assert locs[stack[-1]]["role"] == "block"
            else:
                assert locs[stack[-1]]["role"] in {"block", "stmt"}
    assert not stack

    plain = subprocess.run(
        [sys.executable, source.name],
        cwd=source.parent,
        input=_stdin(source),
        capture_output=True,
        check=False,
        timeout=5,
    )
    assert "".join(output).encode() == plain.stdout


def test_instrumented_diverse_standard_library_and_language_constructs_compile() -> (
    None
):
    stdlib = Path(ast.__file__).parent
    modules = [
        "abc.py",
        "argparse.py",
        "ast.py",
        "base64.py",
        "bisect.py",
        "calendar.py",
        "cmd.py",
        "code.py",
        "colorsys.py",
        "configparser.py",
        "contextlib.py",
        "copy.py",
        "csv.py",
        "dataclasses.py",
        "difflib.py",
        "enum.py",
        "fnmatch.py",
        "fractions.py",
        "functools.py",
        "graphlib.py",
    ]
    sources: list[tuple[str, str]] = []
    for name in modules:
        path = stdlib / name
        with tokenize.open(path) as file:
            sources.append((name, file.read()))
    sources.append(("constructs.py", _LANGUAGE_CONSTRUCTS))

    for filename, source in sources:
        tree = ast.parse(source, filename=filename)
        compile(instrument(tree, source, filename).tree, filename, "exec")


def test_parameter_locs_cover_utf16_identifiers_without_stars_or_annotations() -> None:
    source = (
        "def gather(𐐀: int, ﬀ: int, \U0001d499: str, /, "
        "first=1, *args: str, named=True, **kwargs: int):\n"
        "    return first\n"
    )
    encoded = source.encode("utf-16-le")
    result = instrument(ast.parse(source), source, "main.py")
    definition = next(
        index
        for index, loc in enumerate(result.locs)
        if loc["role"] == "stmt"
        and source[loc["start"] : loc["end"]].startswith("def ")
    )
    parameter_ranges = [
        encoded[loc["start"] * 2 : loc["end"] * 2].decode("utf-16-le")
        for loc in result.locs
        if loc["role"] == "expr" and loc["parent"] == definition
    ]

    assert parameter_ranges == [
        "𐐀",
        "ﬀ",
        "\U0001d499",
        "first",
        "args",
        "named",
        "kwargs",
    ]


def test_loop_entry_values_capture_only_destructured_names_in_source_order(
    tmp_path: Path,
) -> None:
    source = (
        "class Box:\n    pass\n"
        "box = Box()\nitems = [None]\n"
        "for first, [second, *rest], box.attr, items[0] in "
        "[(1, [2, 3, 4], 5, 6)]:\n    pass\n"
    )
    path = tmp_path / "prog.py"
    path.write_text(source, encoding="utf-8")
    lines = _trace(path).stdout.decode().splitlines()
    locs = json.loads(lines[0])["locs"]
    events = [json.loads(line) for line in lines[1:]]
    iteration = next(
        index for index, loc in enumerate(locs) if loc.get("unit") == "iteration"
    )
    entered = events.index({"op": "enter", "loc": iteration})
    values = [event for event in events if event["op"] == "value" and "loc" in event]

    rest = values[2]["value"]["ref"]
    [rest_object] = [
        event for event in events if event["op"] == "obj" and event["id"] == rest
    ]

    assert [
        (
            source[locs[event["loc"]]["start"] : locs[event["loc"]]["end"]],
            event["value"],
        )
        for event in values
    ] == [
        ("first", {"kind": "number", "text": "1"}),
        ("second", {"kind": "number", "text": "2"}),
        ("rest", {"ref": rest}),
    ]
    assert rest_object["items"] == [
        {"kind": "number", "text": "3"},
        {"kind": "number", "text": "4"},
    ]
    after_entry = [event for event in events[entered + 1 :] if event["op"] != "obj"]
    assert after_entry[:3] == values
    assert all(
        locs[event["loc"]]["parent"] == locs[iteration]["parent"] for event in values
    )


def test_a_function_records_changes_for_its_first_thousand_calls_only(
    tmp_path: Path,
) -> None:
    path = tmp_path / "prog.py"
    path.write_text(
        "def square(x):\n    y = x * x\n\nfor i in range(1001):\n    square(i)\n",
        encoding="utf-8",
    )
    events = [json.loads(line) for line in _trace(path).stdout.splitlines()[1:]]

    squares = [event["value"] for event in events if event.get("name") == "y"]

    assert len(squares) == 1000
    assert squares[-1] == {"kind": "number", "text": "998001"}


def test_syntax_and_runtime_failures_have_source_only_diagnostics(
    tmp_path: Path,
) -> None:
    syntax_source = '값 = "한 😀" + * 2\n'
    syntax_path = tmp_path / "prog.py"
    syntax_path.write_text(syntax_source, encoding="utf-8")
    syntax_result = _trace(syntax_path)
    syntax_lines = syntax_result.stdout.decode().splitlines()
    syntax_header = json.loads(syntax_lines[0])
    syntax_end = json.loads(syntax_lines[1])

    assert syntax_result.returncode == 0
    assert syntax_header["locs"] == []
    assert syntax_end == {
        "op": "end",
        "status": "syntax_error",
        "message": "invalid syntax",
        "file": 0,
        "start": 13,
        "end": 14,
    }

    exception_source = 'def fail():\n    raise ValueError("bad")\n\nfail()\n'
    syntax_path.write_text(exception_source, encoding="utf-8")
    exception_result = _trace(syntax_path)
    exception_end = json.loads(exception_result.stdout.decode().splitlines()[-1])
    rendered = exception_end["traceback"]

    assert exception_result.returncode == 0
    assert exception_end["status"] == "exception"
    assert 'File "prog.py", line 4' in rendered
    assert 'File "prog.py", line 2' in rendered
    assert "raise ValueError" in rendered
    assert "codewalk" not in rendered
    assert str(tmp_path) not in rendered


def test_an_inconsistent_dedent_is_a_syntax_error_rather_than_a_tracer_crash(
    tmp_path: Path,
) -> None:
    path = tmp_path / "prog.py"
    path.write_text("if x:\n    a\n  b\n", encoding="utf-8")
    result = _trace(path)
    end = json.loads(result.stdout.decode().splitlines()[-1])

    assert result.returncode == 0
    assert end["status"] == "syntax_error"
    assert end["message"] == "unindent does not match any outer indentation level"


def test_exception_formatting_neither_records_nor_raises_from_user_str(
    tmp_path: Path,
) -> None:
    path = tmp_path / "prog.py"
    path.write_text(
        "class Loud(Exception):\n"
        "    def __str__(self):\n"
        "        print('hidden')\n"
        "        return 'loud'\n"
        "class Broken(Exception):\n"
        "    def __str__(self):\n"
        "        raise ValueError('str failed')\n"
        "def fail(error):\n"
        "    raise error\n"
        "try:\n"
        "    fail(Broken())\n"
        "except Broken:\n"
        "    print('caught')\n"
        "fail(Loud())\n",
        encoding="utf-8",
    )
    events = [json.loads(line) for line in _trace(path).stdout.splitlines()[1:]]

    assert [event["text"] for event in events if event["op"] == "out"] == ["caught\n"]
    assert [event["exc"] for event in events if "exc" in event] == [
        "Broken",
        "Broken",
        "Loud: loud",
        "Loud: loud",
    ]
    assert events[-1]["traceback"].endswith("Loud: loud\n")


_LANGUAGE_CONSTRUCTS = '''\
type Alias[T] = list[T]
total = 0
data = [1]

def deco(*args):
    return lambda function: function

@deco(1)
def outer(x: int = 1):
    global total
    y = 0
    def inner():
        nonlocal y
        y += data[index()]
        del data[index()]
        return f"{f'{x}':>{2}}"
    match x:
        case Point(value=1) | Point(value=2) if check(x):
            (y := 1)
        case Color.RED:
            pass
    try:
        raise ExceptionGroup("group", [ValueError()])
    except* ValueError:
        pass
    with manager() as one, manager() as two:
        call(*(one, two))
    return lambda value: value

async def asynchronous():
    await work()

items = (outer(value) for value in data)
result = 0 < outer() < 3

class Documented:
    """A class docstring."""
'''
