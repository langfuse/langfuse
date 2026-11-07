#!/usr/bin/env python3
"""Compare gateways run by scripts/competitors.sh: Markdown tables and charts.

Usage: compare.py [--charts DIR] [--events EVENTS.jsonl] [--image LABEL=MB ...]
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


def charts(runs, baseline, out, images):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    os.makedirs(out, exist_ok=True)
    colors = plt.rcParams["axes.prop_cycle"].by_key()["color"]

    def series(cases, prefix, value):
        xs, ys = [], []
        for level in levels(cases, prefix):
            result = value(cases[f"{prefix}{level}"], level)
            if result is not None:
                xs.append(level)
                ys.append(result)
        return xs, ys

    def sweep_chart(name, metric_name, ylabel, title, subtract):
        fig, ax = plt.subplots(figsize=(8.5, 5))
        for index, (label, cases) in enumerate(runs):
            for quantile, style in (("p50", "-o"), ("p99", "--s")):

                def value(case, level, quantile=quantile):
                    if subtract:
                        result = added(case, baseline.get(f"direct-c{level}"), metric_name, quantile)
                    else:
                        result = metric(case, metric_name, quantile)
                    return max(result, 0.05) if result is not None else None

                xs, ys = series(cases, "gateway-c", value)
                if xs:
                    ax.plot(xs, ys, style, color=colors[index % len(colors)], label=f"{label} {quantile}")
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("Concurrent streaming requests (~500 KB Chat Completions)")
        ax.set_ylabel(ylabel)
        ax.set_title(title)
        ax.grid(True, which="both", alpha=0.3)
        ax.legend(fontsize=7, ncol=2)
        fig.tight_layout()
        fig.savefig(os.path.join(out, name), dpi=150)
        plt.close(fig)

    sweep_chart(
        "added-ttft.png", "ttft_ms", "Added time to first token vs direct (ms)", "End-to-end overhead: added TTFT, 2 vCPU / 4 GiB", True
    )
    sweep_chart(
        "added-latency.png",
        "pre_upstream_ms",
        "Added latency before upstream (ms)",
        "Added latency before the request reaches the upstream",
        True,
    )
    sweep_chart("chunk-lag.png", "chunk_lag_ms", "Upstream send to client receive (ms)", "Streaming chunk lag", False)

    fig, ax = plt.subplots(figsize=(8.5, 5))
    for index, (label, cases) in enumerate(runs):
        xs, ys = series(cases, "gateway-c", lambda case, _: case["ok_rps"])
        if xs:
            ax.plot(xs, ys, "-o", color=colors[index % len(colors)], label=label)
    xs, ys = series(baseline, "direct-c", lambda case, _: case["ok_rps"])
    ax.plot(xs, ys, ":", color="grey", label="Direct to mock")
    ax.set_xscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Successful requests per second")
    ax.set_title("Throughput on 2 vCPU / 4 GiB")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "throughput.png"), dpi=150)
    plt.close(fig)

    fig, ax = plt.subplots(figsize=(8.5, 5))
    for index, (label, cases) in enumerate(runs):
        xs, ys = series(cases, "gateway-long-c", lambda case, _: peak(case))
        if xs:
            ax.plot(xs, ys, "-o", color=colors[index % len(colors)], label=label)
    ax.axhline(4096, color="red", linestyle=":", label="Container limit (4 GiB)")
    ax.set_xlabel("Concurrent ~5 s streams")
    ax.set_ylabel("Peak anonymous memory (MiB)")
    ax.set_title("Memory under long streams")
    ax.grid(True, alpha=0.3)
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(os.path.join(out, "long-stream-memory.png"), dpi=150)
    plt.close(fig)

    bursts = [(label, cases) for label, cases in runs if levels(cases, "gateway-burst")]
    if bursts:
        fig, axes = plt.subplots(1, len(bursts), figsize=(3.2 * len(bursts), 4.8), sharey=True)
        axes = axes if len(bursts) > 1 else [axes]
        for ax, (label, cases) in zip(axes, bursts):
            sizes = levels(cases, "gateway-burst")
            split = [status_counts(cases[f"gateway-burst{size}"]) for size in sizes]
            bottom = [0.0] * len(sizes)
            for part, color, name in ((0, "#2ca02c", "OK"), (1, "#ff7f0e", "503"), (2, "#d62728", "Timeout or dropped")):
                values = [parts[part] / max(sum(parts), 1) * 100 for parts in split]
                ax.bar([str(size) for size in sizes], values, bottom=bottom, color=color, label=name)
                bottom = [b + v for b, v in zip(bottom, values)]
            ax.set_title(label, fontsize=9)
            ax.set_xlabel("Simultaneous requests", fontsize=8)
        axes[0].set_ylabel("Share of requests (%)")
        handles, names = axes[0].get_legend_handles_labels()
        fig.legend(handles, names, loc="lower center", ncol=3, fontsize=8)
        fig.suptitle("Bursts: every request released at once, 5 rounds")
        fig.tight_layout(rect=(0, 0.07, 1, 1))
        fig.savefig(os.path.join(out, "burst-outcomes.png"), dpi=150)
        plt.close(fig)

    clients = [(label, cases[f"budget-c{levels(cases, 'budget-c')[0]}"]) for label, cases in runs if levels(cases, "budget-c")]
    if clients:
        fig, (left, right) = plt.subplots(1, 2, figsize=(11, 4.5))
        names = [label for label, _ in clients]
        left.barh(names, [case["ok_rps"] for _, case in clients], color=colors[: len(clients)])
        left.set_xlabel("Successful requests per second")
        left.invert_yaxis()
        fail = [metric(case, "error_total_ms", "p50") or 0 for _, case in clients]
        bars = right.barh(names, [max(value, 0.1) for value in fail], color=colors[: len(clients)])
        right.bar_label(
            bars,
            labels=[f"{value / 1000:.0f} s" if value >= 1000 else f"{value:.1f} ms" for value in fail],
            padding=3,
            fontsize=8,
        )
        right.set_xscale("log")
        right.set_xlabel("Median time until a failed request fails (ms, log)")
        right.set_yticklabels([])
        right.invert_yaxis()
        right.set_xlim(right=max(fail) * 20)
        fig.suptitle("2,000 closed-loop clients, past every gateway's capacity")
        fig.tight_layout()
        fig.savefig(os.path.join(out, "past-capacity.png"), dpi=150)
        plt.close(fig)

    if images:
        fig, ax = plt.subplots(figsize=(7, 3.5))
        labels = [label for label, _ in images]
        sizes = [size for _, size in images]
        bars = ax.barh(labels, sizes, color=colors[: len(images)])
        ax.bar_label(bars, labels=[f"{size:.0f} MB" for size in sizes], padding=3)
        ax.set_xlabel("Compressed image size, linux/amd64 (MB)")
        ax.set_title("Published container image size")
        ax.invert_yaxis()
        ax.set_xlim(0, max(sizes) * 1.2)
        fig.tight_layout()
        fig.savefig(os.path.join(out, "image-size.png"), dpi=150)
        plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--charts")
    parser.add_argument("--events")
    parser.add_argument("--image", action="append", default=[])
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
        images = [(label, float(size)) for label, _, size in (spec.rpartition("=") for spec in args.image)]
        charts(plain, baseline, args.charts, images)


if __name__ == "__main__":
    main()
