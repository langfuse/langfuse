#!/usr/bin/env python3
"""Break the gateway's own sampled spans down per benchmark case.

Usage: spans.py RUN_DIR [results/otel/traces.jsonl] [CHART.png] [CHART_TITLE_NOTE]

Cases are matched by time: a span belongs to the case whose cgroup sample window
contains its start. Prints p50/p99 per span name, which separates `/resolve`
(Web) from body buffering, telemetry capture, and the provider call.
"""
import json
import os
import sys
from collections import defaultdict

run = sys.argv[1]
traces = sys.argv[2] if len(sys.argv) > 2 else "results/otel/traces.jsonl"
windows = []
for name in os.listdir(run):
    if name.endswith(".cgroup.csv"):
        with open(os.path.join(run, name)) as handle:
            times = [float(line.split(",", 1)[0]) for line in handle.readlines()[1:]]
        if times:
            windows.append((times[0], times[-1], name[: -len(".cgroup.csv")]))
windows.sort()

durations = defaultdict(lambda: defaultdict(list))
by_trace = defaultdict(dict)
with open(traces) as handle:
    for line in handle:
        for resource in json.loads(line).get("resourceSpans", []):
            for scope in resource["scopeSpans"]:
                for span in scope["spans"]:
                    start = int(span["startTimeUnixNano"]) / 1e9
                    case = next((label for lo, hi, label in windows if lo <= start <= hi), None)
                    if case:
                        duration = (int(span["endTimeUnixNano"]) - int(span["startTimeUnixNano"])) / 1e6
                        durations[case][span["name"]].append(duration)
                        by_trace[(case, span["traceId"])][span["name"]] = (start, duration)

# Gateway time between accepting the request and sending it upstream, excluding
# the client upload (request.body) and Web's /resolve answer (resolution).
for (case, _), spans in by_trace.items():
    root = next((value for name, value in spans.items() if name.startswith("POST ")), None)
    if root and {"provider.headers", "resolution", "request.body"} <= spans.keys():
        before_upstream = (spans["provider.headers"][0] - root[0]) * 1000
        durations[case]["gateway.self"].append(
            before_upstream - spans["resolution"][1] - spans["request.body"][1]
        )


def quantile(values, q):
    values = sorted(values)
    return values[min(len(values) - 1, int(q * len(values)))]


names = ("gateway.self", "resolution", "request.body", "request.capture", "provider.headers")
print("| Case | n | " + " | ".join(f"{n} p50 / p99 (ms)" for n in names) + " |")
print("|---|---:|" + "---|" * len(names))
for _, _, case in windows:
    spans = durations.get(case)
    if not spans or "resolution" not in spans:
        continue
    cells = []
    for name in names:
        values = spans.get(name)
        cells.append(f"{quantile(values, 0.5):.2f} / {quantile(values, 0.99):.2f}" if values else "–")
    print(f"| {case} | {len(spans['resolution'])} | " + " | ".join(cells) + " |")

if len(sys.argv) > 3:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    sweep = sorted(
        (int(case[len("gateway-c") :]), spans)
        for case, spans in durations.items()
        if case.startswith("gateway-c") and case[len("gateway-c") :].isdigit() and "gateway.self" in spans
    )
    fig, ax = plt.subplots(figsize=(8, 4.5))
    xs = [level for level, _ in sweep]
    for name, label, color in (("gateway.self", "gateway's own work", "tab:green"), ("resolution", "/resolve round trip to Web", "tab:purple")):
        ax.plot(xs, [quantile(s[name], 0.5) for _, s in sweep], "-o", color=color, label=f"{label} p50")
        ax.plot(xs, [quantile(s[name], 0.99) for _, s in sweep], "--s", color=color, label=f"{label} p99")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Time before the upstream request (ms)")
    note = f", {sys.argv[4]}" if len(sys.argv) > 4 else ""
    ax.set_title(f"Where the pre-upstream time goes (gateway spans{note})")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(sys.argv[3], dpi=150)
