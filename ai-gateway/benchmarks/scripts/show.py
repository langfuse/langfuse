#!/usr/bin/env python3
"""Print a compact view of one or more loadgen summary JSON files (or stdin)."""
import json
import sys

KEYS = ("pre_upstream_ms", "ttfb_ms", "ttft_ms", "total_ms", "chunk_lag_ms", "chunk_gap_ms")


def show(summary):
    print(
        f"{summary['label']}: c={summary['concurrency']} ok={summary['ok']} "
        f"errors={summary['errors']} rps={summary['ok_rps']:.1f}"
    )
    for key in KEYS:
        stats = summary["metrics"].get(key)
        if stats:
            values = " ".join(f"{q}={stats[q]:.2f}" for q in ("p50", "p90", "p99", "max"))
            print(f"  {key:16} {values}")


paths = sys.argv[1:]
if not paths:
    show(json.load(sys.stdin))
for path in paths:
    with open(path) as handle:
        show(json.load(handle))
