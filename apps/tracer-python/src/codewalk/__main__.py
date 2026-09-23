"""Command-line entry point for the Python tracer."""

import argparse
from pathlib import Path

from codewalk.run import run


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m codewalk")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("path", type=Path)
    run_parser.add_argument("--trace-fd", type=_nonnegative_int, default=1)
    args = parser.parse_args()

    if not args.path.is_file():
        run_parser.error(f"file does not exist: {args.path}")

    try:
        run(args.path, trace_fd=args.trace_fd)
    except OSError as error:
        run_parser.error(str(error))


def _nonnegative_int(value: str) -> int:
    number = int(value)
    if number < 0:
        raise argparse.ArgumentTypeError("must be non-negative")
    return number


if __name__ == "__main__":
    main()
