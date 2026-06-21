"""Find Python files larger than a size threshold.

Usage:
    python3 find_large_py_files.py [ROOT] [--min-size-mb 1]
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


BYTES_PER_MB = 1_048_576


def human_readable_size(size_bytes: int) -> str:
    """Return a size in bytes formatted as megabytes."""
    return f"{size_bytes / BYTES_PER_MB:.2f} MB"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Recursively find .py files larger than a size threshold."
    )
    parser.add_argument(
        "root",
        nargs="?",
        default=".",
        help="Directory tree to scan. Defaults to the current directory.",
    )
    parser.add_argument(
        "--min-size-mb",
        type=float,
        default=1.0,
        help="Minimum file size in MB, where 1 MB is 1,048,576 bytes. Defaults to 1.",
    )
    return parser.parse_args()


def warn_os_error(error: OSError) -> None:
    print(f"warning: cannot access {error.filename}: {error.strerror}", file=sys.stderr)


def iter_large_python_files(root: Path, min_size_bytes: int):
    def on_walk_error(error: OSError) -> None:
        warn_os_error(error)

    for dirpath, dirnames, filenames in os.walk(root, onerror=on_walk_error):
        dirnames.sort()
        for filename in sorted(filenames):
            if not filename.endswith(".py"):
                continue

            path = Path(dirpath) / filename
            try:
                size = path.stat().st_size
            except OSError as error:
                warn_os_error(error)
                continue

            if size > min_size_bytes:
                yield path, size


def main() -> int:
    args = parse_args()
    if args.min_size_mb < 0:
        print("error: --min-size-mb must be non-negative", file=sys.stderr)
        return 2

    root = Path(args.root)
    min_size_bytes = int(args.min_size_mb * BYTES_PER_MB)

    for path, size in iter_large_python_files(root, min_size_bytes):
        print(f"{path}\t{human_readable_size(size)}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
