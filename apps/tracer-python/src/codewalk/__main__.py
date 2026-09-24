"""Command-line entry point for the Python tracer."""

import argparse
from pathlib import Path

from codewalk.run import run


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m codewalk")
    parser.add_argument("path", type=Path)
    parser.add_argument("--trace-fd", type=int, default=1)
    args = parser.parse_args()
    run(args.path, trace_fd=args.trace_fd)


if __name__ == "__main__":
    main()
