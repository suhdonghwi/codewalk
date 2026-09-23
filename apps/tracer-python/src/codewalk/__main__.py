"""Command-line entry point for the Python tracer."""

import argparse
from pathlib import Path

from codewalk.run import run


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m codewalk")
    subparsers = parser.add_subparsers(dest="command", required=True)
    run_parser = subparsers.add_parser("run")
    run_parser.add_argument("path", type=Path)
    run_parser.add_argument("--trace-fd", type=int, default=1)
    args = parser.parse_args()
    run(args.path, trace_fd=args.trace_fd)


if __name__ == "__main__":
    main()
