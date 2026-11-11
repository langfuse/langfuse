#!/usr/bin/env python3
"""Compare gateways run by scripts/competitors.sh: Markdown tables and charts.

Usage: compare.py [--charts DIR] [--events EVENTS.jsonl] [--footnote TEXT]
                  RESULTS_DIR=LABEL [RESULTS_DIR=LABEL ...]

The first run must contain the direct-to-mock baseline (the Langfuse gateway's
run); every gateway's added latency is measured against it. --events takes the
output of `docker events --format '{{json .}}'` recorded during the session, to
count kernel out-of-memory kills in each case.
"""
import argparse
import json
import os

from analyze import MIB, errors, fmt, levels, load_run, metric

LONG_LOW, LONG_HIGH = 100, 1000


def added(case, base, name, quantile):
    value = metric(case, name, quantile)
    if value is None:
        return None
    return value - (metric(base, name, quantile) or 0.0)


def peak(case, key="peak_anon"):
    return case["resources"].get("ai-gateway", {}).get(key, 0) / MIB if case else None


def cpu(case):
    return case["resources"].get("ai-gateway", {}).get("cpu_p50") if case else None


def status_counts(case):
    """Requests split into ok, 503 (admission control) and every other failure."""
    unavailable = sum(count for kind, count in case["errors"].items() if kind in ("503", "http_503"))
    return case["ok"], unavailable, case["requests"] - case["ok"] - unavailable


def case_window(path, label):
    try:
        with open(os.path.join(path, f"{label}.cgroup.csv")) as handle:
            rows = handle.read().splitlines()[1:]
    except OSError:
        return None
    return (float(rows[0].split(",")[0]), float(rows[-1].split(",")[0])) if rows else None


GATEWAY_SERVICES = ("ai-gateway", "litellm", "portkey", "portkey-2x")


def oom_kills(events, path, label):
    """Kernel OOM kills inside the gateway's containers while this case ran."""
    span = case_window(path, label)
    if events is None or span is None:
        return None
    return sum(
        1
        for event in events
        if event.get("status") == "oom"
        and event.get("Actor", {}).get("Attributes", {}).get("com.docker.compose.service") in GATEWAY_SERVICES
        and span[0] <= event.get("timeNano", 0) / 1e9 <= span[1]
    )


def sweep_tables(runs, baseline):
    out = []
    for label, cases in runs:
        rows = [
            f"#### {label}\n",
            "| Concurrency | RPS | Errors | Added before upstream p50 / p99 (ms) | Added TTFT p50 / p99 (ms) | Chunk lag p50 / p99 (ms) | Peak memory (MiB) | CPU p50 (cores) |",
            "|---:|---:|---|---|---|---|---:|---:|",
        ]
        for level in levels(cases, "gateway-c"):
            case, base = cases[f"gateway-c{level}"], baseline.get(f"direct-c{level}")
            rows.append(
                f"| {level} | {case['ok_rps']:.0f} | {errors(case)} | "
                f"{fmt(added(case, base, 'pre_upstream_ms', 'p50'))} / {fmt(added(case, base, 'pre_upstream_ms', 'p99'))} | "
                f"{fmt(added(case, base, 'ttft_ms', 'p50'))} / {fmt(added(case, base, 'ttft_ms', 'p99'))} | "
                f"{fmt(metric(case, 'chunk_lag_ms', 'p50'))} / {fmt(metric(case, 'chunk_lag_ms', 'p99'))} | "
                f"{fmt(peak(case), 0)} | {fmt(cpu(case))} |"
            )
        out.append("\n".join(rows))
    return "\n\n".join(out)


def headline_table(runs, baseline, quantile_levels=(1, 100, 250, 1000)):
    header = "| Gateway | " + " | ".join(f"c{level} p50 / p99" for level in quantile_levels) + " |"
    rows = [header, "|---|" + "---|" * len(quantile_levels)]
    for label, cases in runs:
        cells = []
        for level in quantile_levels:
            case, base = cases.get(f"gateway-c{level}"), baseline.get(f"direct-c{level}")
            if not case:
                cells.append("–")
                continue
            text = f"{fmt(added(case, base, 'ttft_ms', 'p50'), 1)} / {fmt(added(case, base, 'ttft_ms', 'p99'), 1)}"
            failed = case["requests"] - case["ok"]
            if failed:
                text += f" ({failed} errors, {case['error_rate'] * 100:.1f}%)"
            cells.append(text)
        rows.append(f"| {label} | " + " | ".join(cells) + " |")
    return "\n".join(rows)


def throughput_table(runs):
    rows = [
        "| Gateway | Max RPS with < 0.1% errors | At concurrency | Max RPS at any error rate | Errors there |",
        "|---|---:|---:|---:|---|",
    ]
    for label, cases in runs:
        sweep = [cases[f"gateway-c{level}"] | {"level": level} for level in levels(cases, "gateway-c")]
        if not sweep:
            continue
        clean = [case for case in sweep if case["error_rate"] < 0.001]
        best_clean = max(clean, key=lambda case: case["ok_rps"]) if clean else None
        best = max(sweep, key=lambda case: case["ok_rps"])
        rows.append(
            f"| {label} | {best_clean['ok_rps']:.0f} | {best_clean['level']} | "
            if best_clean
            else f"| {label} | – | – | "
        )
        rows[-1] += f"{best['ok_rps']:.0f} (c{best['level']}) | {errors(best)} |"
    return "\n".join(rows)


def long_table(runs, baseline):
    rows = [
        "| Gateway | Concurrent streams | RPS | Errors | Added before upstream p50 / p99 (ms) | Chunk lag p99 (ms) | Peak anon / memory.current (MiB) |",
        "|---|---:|---:|---|---|---:|---|",
    ]
    per_stream = []
    for label, cases in runs:
        found = levels(cases, "gateway-long-c")
        for level in found:
            case, base = cases[f"gateway-long-c{level}"], baseline.get(f"direct-long-c{level}")
            rows.append(
                f"| {label} | {level} | {case['ok_rps']:.0f} | {errors(case)} | "
                f"{fmt(added(case, base, 'pre_upstream_ms', 'p50'))} / {fmt(added(case, base, 'pre_upstream_ms', 'p99'))} | "
                f"{fmt(metric(case, 'chunk_lag_ms', 'p99'))} | {fmt(peak(case), 0)} / {fmt(peak(case, 'peak_current'), 0)} |"
            )
        low, high = cases.get(f"gateway-long-c{LONG_LOW}"), cases.get(f"gateway-long-c{LONG_HIGH}")
        if low and high:
            slope = (peak(high) - peak(low)) * 1024 / (LONG_HIGH - LONG_LOW)
            per_stream.append(f"| {label} | {slope:.0f} | {fmt(peak(low), 0)} |")
    table = "\n".join(rows)
    if per_stream:
        table += (
            f"\n\nMemory per stream is the growth in peak anonymous memory from {LONG_LOW} to {LONG_HIGH} "
            "concurrent ~5 s streams, divided by the extra streams.\n\n"
            f"| Gateway | Memory per stream (KiB) | Peak memory at {LONG_LOW} streams (MiB) |\n|---|---:|---:|\n"
            + "\n".join(per_stream)
        )
    return table


def overload_table(runs, events):
    rows = [
        "| Gateway | Case | Requests | OK | 503 | Other errors | Peak anon / memory.current (MiB) | TTFT p99 of OK (ms) | Time to fail p50 (ms) | OOM kills |",
        "|---|---|---:|---:|---:|---:|---|---:|---:|---:|",
    ]
    totals = []
    for label, cases, path in runs:
        for case_label in [f"gateway-burst{size}" for size in levels(cases, "gateway-burst")] + [
            f"budget-c{level}" for level in levels(cases, "budget-c")
        ]:
            case = cases[case_label]
            ok, unavailable, other = status_counts(case)
            kinds = ", ".join(f"{kind} {count}" for kind, count in case["errors"].items() if kind not in ("503", "http_503"))
            rows.append(
                f"| {label} | {case_label.replace('gateway-', '')} | {case['requests']} | {ok} | {unavailable} | "
                f"{other}{f' ({kinds})' if kinds else ''} | {fmt(peak(case), 0)} / {fmt(peak(case, 'peak_current'), 0)} | "
                f"{fmt(metric(case, 'ttft_ms', 'p99'), 0)} | {fmt(metric(case, 'error_total_ms', 'p50'), 1)} | "
                f"{fmt(oom_kills(events, path, case_label), 0)} |"
            )
        if events is not None:
            total = sum(oom_kills(events, path, case_label) or 0 for case_label in cases)
            totals.append(f"| {label} | {total} |")
    table = "\n".join(rows)
    if totals:
        table += "\n\n| Gateway | OOM kills across all its cases |\n|---|---:|\n" + "\n".join(totals)
    return table


COLORS = {"Rust": "#2563eb", "Node.js": "#16a34a", "Node.js, 2 replicas": "#86c99a", "Python": "#d97706", "Python, translating route": "#f5b971"}
LIMIT_MIB = 4096


def color(label, index):
    return COLORS.get(label, ["#7c3aed", "#db2777", "#0891b2"][index % 3])


def charts(runs, baseline, out, footnote):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter, NullFormatter

    os.makedirs(out, exist_ok=True)
    plt.rcParams.update(
        {
            "font.size": 11,
            "axes.titlesize": 13,
            "axes.titleweight": "bold",
            "axes.spines.top": False,
            "axes.spines.right": False,
            "axes.grid": True,
            "grid.alpha": 0.25,
            "legend.frameon": False,
        }
    )
    number = FuncFormatter(lambda value, _: f"{value:,.0f}" if value >= 1 else f"{value:g}")

    def save(fig, name, title):
        fig.suptitle(title, x=0.02, ha="left", fontsize=15, fontweight="bold")
        fig.text(0.02, 0.01, footnote, fontsize=8.5, color="#666666", ha="left")
        fig.savefig(os.path.join(out, name), dpi=200, bbox_inches="tight")
        plt.close(fig)

    fig, axes = plt.subplots(1, 2, figsize=(12, 5), sharey=True)
    for ax, quantile, name in zip(axes, ("p50", "p99"), ("Median (p50)", "Tail (p99)")):
        for index, (label, cases) in enumerate(runs):
            xs, ys = [], []
            for level in levels(cases, "gateway-c"):
                value = added(cases[f"gateway-c{level}"], baseline.get(f"direct-c{level}"), "ttft_ms", quantile)
                if value is not None:
                    xs.append(level)
                    ys.append(max(value, 0.1))
            ax.plot(xs, ys, "-o", color=color(label, index), label=label, linewidth=2.2, markersize=5)
        ax.set_xscale("log")
        ax.set_yscale("log")
        ticks = sorted({level for _, cases in runs for level in levels(cases, "gateway-c")})
        ax.set_xticks(ticks)
        ax.xaxis.set_major_formatter(number)
        ax.xaxis.set_minor_formatter(NullFormatter())
        ax.yaxis.set_major_formatter(number)
        ax.set_title(name, loc="left")
        ax.set_xlabel("Concurrent streaming requests")
    axes[0].set_ylabel("Added time to first token vs direct (ms, log)")
    axes[0].legend(loc="upper left")
    fig.tight_layout(rect=(0, 0.04, 1, 0.93))
    save(fig, "added-ttft.png", "Added latency: time to first token added by the gateway")

    fig, ax = plt.subplots(figsize=(13, 5.2))
    level = LONG_HIGH
    direct = baseline.get(f"direct-long-c{level}")
    for index, (label, cases) in enumerate(runs):
        case = cases.get(f"gateway-long-c{level}")
        rows = case["resources"].get("ai-gateway", {}).get("rows", []) if case else []
        if not rows:
            continue
        start = rows[0][0]
        served = f"{case['ok_rps']:.0f} of {direct['ok_rps']:.0f} streams/s served" if direct else f"{case['ok_rps']:.0f} streams/s"
        ax.plot(
            [row[0] - start for row in rows],
            [row[1] / MIB for row in rows],
            color=color(label, index),
            linewidth=2,
            label=f"{label}: {served}",
        )
    ax.axhline(LIMIT_MIB, color="#dc2626", linestyle="--", linewidth=1.2)
    ax.annotate("4 GiB container limit", (0.99, LIMIT_MIB), xycoords=("axes fraction", "data"), ha="right", va="bottom", color="#dc2626", fontsize=9)
    ax.set_ylim(0, LIMIT_MIB * 1.08)
    ax.yaxis.set_major_formatter(number)
    ax.set_xlabel("Seconds since the load started")
    ax.set_ylabel("Container memory (MiB)")
    ax.legend(loc="upper left", bbox_to_anchor=(1.01, 1), borderaxespad=0)
    fig.tight_layout(rect=(0, 0.04, 1, 0.93))
    save(fig, "memory-over-time.png", f"Memory over time: {level:,} concurrent 5-second streams")

    best = []
    for index, (label, cases) in enumerate(runs):
        clean = [cases[f"gateway-c{lvl}"]["ok_rps"] for lvl in levels(cases, "gateway-c") if cases[f"gateway-c{lvl}"]["error_rate"] < 0.001]
        if clean:
            best.append((label, max(clean), color(label, index)))
    best.sort(key=lambda item: -item[1])
    fig, ax = plt.subplots(figsize=(10, 0.8 + 0.75 * len(best)))
    bars = ax.barh([label for label, _, _ in best], [value for _, value, _ in best], color=[c for _, _, c in best], height=0.6)
    top = best[0][1] if best else 1
    ax.bar_label(
        bars,
        labels=[f"{value:,.0f} req/s" + ("" if value == top else f"  ({top / value:.0f}x less)") for _, value, _ in best],
        padding=6,
        fontsize=10.5,
    )
    ax.invert_yaxis()
    ax.set_xlim(0, top * 1.3)
    ax.xaxis.set_major_formatter(number)
    ax.set_xlabel("Max sustained streaming requests per second, < 0.1% errors")
    ax.grid(axis="y", visible=False)
    fig.tight_layout(rect=(0, 0.06, 1, 0.9))
    save(fig, "throughput.png", "Max sustained throughput on the same 2 vCPU / 4 GiB")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--charts")
    parser.add_argument("--events")
    parser.add_argument(
        "--footnote",
        default="Each gateway alone on 2 vCPU / 4 GiB; ~500 KB streaming Chat Completions against the same mock upstream.",
    )
    parser.add_argument("runs", nargs="+")
    args = parser.parse_args()
    runs = []
    for spec in args.runs:
        path, _, label = spec.partition("=")
        runs.append((label or os.path.basename(os.path.normpath(path)), load_run(path), path))
    baseline = {label: case for label, case in runs[0][1].items() if label.startswith("direct-")}
    events = None
    if args.events:
        with open(args.events) as handle:
            events = [json.loads(line) for line in handle if line.strip()]
    plain = [(label, cases) for label, cases, _ in runs]
    print("### Added time to first token versus direct (ms)\n\n" + headline_table(plain, baseline) + "\n")
    print("### Throughput on 2 vCPU\n\n" + throughput_table(plain) + "\n")
    print("### Concurrency sweep\n\n" + sweep_tables(plain, baseline) + "\n")
    print("### Long streams\n\n" + long_table(plain, baseline) + "\n")
    print("### Past capacity\n\n" + overload_table(runs, events) + "\n")
    if args.charts:
        charts(plain, baseline, args.charts, args.footnote)


if __name__ == "__main__":
    main()
