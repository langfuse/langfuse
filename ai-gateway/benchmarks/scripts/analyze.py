#!/usr/bin/env python3
"""Turn results/<run>/ into markdown tables and PNG charts.

Usage: analyze.py [--charts DIR] RUN_DIR[=NAME] [RUN_DIR[=NAME] ...]

The first run directory is the primary one; sweep and burst charts overlay every
run that has the same cases (e.g. two gateway images). Tables go to stdout.
"""
import argparse
import csv
import json
import os
from collections import defaultdict

MIB = 1024 * 1024


def load_run(path):
    cases = {}
    for name in sorted(os.listdir(path)):
        if not name.endswith(".json"):
            continue
        label = name[: -len(".json")]
        with open(os.path.join(path, name)) as handle:
            summary = json.load(handle)
        summary["resources"] = load_resources(os.path.join(path, f"{label}.cgroup.csv"))
        cases[label] = summary
    return cases


def load_resources(path):
    series = defaultdict(list)
    if not os.path.exists(path):
        return {}
    with open(path) as handle:
        for row in csv.DictReader(handle):
            series[row["service"]].append(
                (
                    float(row["t"]),
                    int(row["memory_current"]),
                    int(row["memory_anon"]),
                    float(row["cpu_cores"]) if row["cpu_cores"] else None,
                )
            )
    out = {}
    for service, rows in series.items():
        cpu = sorted(r[3] for r in rows if r[3] is not None)
        out[service] = {
            "rows": rows,
            "peak_current": max(r[1] for r in rows),
            "peak_anon": max(r[2] for r in rows),
            "cpu_p50": cpu[len(cpu) // 2] if cpu else 0.0,
            "cpu_max": cpu[-1] if cpu else 0.0,
        }
    return out


def metric(case, name, quantile):
    stats = case["metrics"].get(name) if case else None
    return stats[quantile] if stats else None


def fmt(value, digits=2):
    return "–" if value is None else f"{value:.{digits}f}"


def errors(case):
    if not case["errors"] and case["requests"] == case["ok"]:
        return "0"
    parts = [f"{kind} {count}" for kind, count in case["errors"].items()]
    return f"{case['error_rate'] * 100:.1f}% ({', '.join(parts)})"


def levels(cases, prefix):
    found = []
    for label in cases:
        if label.startswith(prefix) and label[len(prefix) :].isdigit():
            found.append(int(label[len(prefix) :]))
    return sorted(found)


def gateway_resources(case):
    gateway = case["resources"].get("ai-gateway", {})
    web = case["resources"].get("langfuse-web", {})
    return gateway, web


def sweep_table(cases):
    rows = [
        "| Concurrency | Gateway RPS | Errors | Added latency p50 / p90 / p99 / max (ms) | TTFT direct p50 / p99 (ms) | TTFT gateway p50 / p99 (ms) | Chunk lag gateway p50 / p99 (ms) | Gateway peak memory (MiB) | Gateway CPU p50 (cores) | Web CPU p50 (cores) |",
        "|---:|---:|---|---|---|---|---|---:|---:|---:|",
    ]
    for level in levels(cases, "gateway-c"):
        gateway = cases[f"gateway-c{level}"]
        direct = cases.get(f"direct-c{level}")
        added = []
        for quantile in ("p50", "p90", "p99", "max"):
            value = metric(gateway, "pre_upstream_ms", quantile)
            base = metric(direct, "pre_upstream_ms", quantile) or 0.0
            added.append(fmt(value - base if value is not None else None))
        gw_res, web_res = gateway_resources(gateway)
        rows.append(
            f"| {level} | {gateway['ok_rps']:.0f} | {errors(gateway)} | {' / '.join(added)} | "
            f"{fmt(metric(direct, 'ttft_ms', 'p50'))} / {fmt(metric(direct, 'ttft_ms', 'p99'))} | "
            f"{fmt(metric(gateway, 'ttft_ms', 'p50'))} / {fmt(metric(gateway, 'ttft_ms', 'p99'))} | "
            f"{fmt(metric(gateway, 'chunk_lag_ms', 'p50'))} / {fmt(metric(gateway, 'chunk_lag_ms', 'p99'))} | "
            f"{fmt(gw_res.get('peak_anon', 0) / MIB, 1)} | {fmt(gw_res.get('cpu_p50'))} | {fmt(web_res.get('cpu_p50'))} |"
        )
    return "\n".join(rows)


def direct_table(cases):
    rows = [
        "| Concurrency | Direct RPS | Errors | Pre-upstream p50 / p99 (ms) | TTFT p50 / p99 (ms) | Chunk lag p50 / p99 (ms) |",
        "|---:|---:|---|---|---|---|",
    ]
    for level in levels(cases, "direct-c"):
        case = cases[f"direct-c{level}"]
        rows.append(
            f"| {level} | {case['ok_rps']:.0f} | {errors(case)} | "
            f"{fmt(metric(case, 'pre_upstream_ms', 'p50'))} / {fmt(metric(case, 'pre_upstream_ms', 'p99'))} | "
            f"{fmt(metric(case, 'ttft_ms', 'p50'))} / {fmt(metric(case, 'ttft_ms', 'p99'))} | "
            f"{fmt(metric(case, 'chunk_lag_ms', 'p50'))} / {fmt(metric(case, 'chunk_lag_ms', 'p99'))} |"
        )
    return "\n".join(rows)


def burst_table(cases):
    rows = [
        "| Burst size | Target | Requests | Errors | Throughput (req/s) | TTFB p50 / p99 / max (ms) | TTFT p99 (ms) | Total p99 (ms) | Gateway peak memory (MiB) |",
        "|---:|---|---:|---|---:|---|---:|---:|---:|",
    ]
    for burst in sorted(set(levels(cases, "gateway-burst")) | set(levels(cases, "direct-burst"))):
        for target in ("direct", "gateway"):
            case = cases.get(f"{target}-burst{burst}")
            if not case:
                continue
            gw_res, _ = gateway_resources(case)
            memory = fmt(gw_res.get("peak_anon", 0) / MIB, 1) if target == "gateway" else "–"
            rows.append(
                f"| {burst} | {target} | {case['requests']} | {errors(case)} | {case['ok_rps']:.0f} | "
                f"{fmt(metric(case, 'ttfb_ms', 'p50'))} / {fmt(metric(case, 'ttfb_ms', 'p99'))} / {fmt(metric(case, 'ttfb_ms', 'max'))} | "
                f"{fmt(metric(case, 'ttft_ms', 'p99'))} | {fmt(metric(case, 'total_ms', 'p99'))} | {memory} |"
            )
    return "\n".join(rows)


def generic_table(cases, labels):
    rows = [
        "| Case | RPS | Errors | Pre-upstream p50 / p90 / p99 / max (ms) | TTFT p50 / p99 (ms) | Error response p50 / max (ms) | Gateway peak memory (MiB) | Gateway CPU p50 | Web CPU p50 |",
        "|---|---:|---|---|---|---|---:|---:|---:|",
    ]
    for label in labels:
        case = cases.get(label)
        if not case:
            continue
        gw_res, web_res = gateway_resources(case)
        pre = " / ".join(fmt(metric(case, "pre_upstream_ms", q)) for q in ("p50", "p90", "p99", "max"))
        rows.append(
            f"| {label} | {case['ok_rps']:.0f} | {errors(case)} | {pre} | "
            f"{fmt(metric(case, 'ttft_ms', 'p50'))} / {fmt(metric(case, 'ttft_ms', 'p99'))} | "
            f"{fmt(metric(case, 'error_total_ms', 'p50'))} / {fmt(metric(case, 'error_total_ms', 'max'))} | "
            f"{fmt(gw_res.get('peak_anon', 0) / MIB, 1)} | {fmt(gw_res.get('cpu_p50'))} | {fmt(web_res.get('cpu_p50'))} |"
        )
    return "\n".join(rows)


def charts(runs, out):
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    os.makedirs(out, exist_ok=True)
    primary_name, primary = runs[0]

    def sweep_series(cases, name, quantile, subtract_direct=False):
        xs, ys = [], []
        for level in levels(cases, "gateway-c"):
            value = metric(cases[f"gateway-c{level}"], name, quantile)
            if value is None:
                continue
            if subtract_direct:
                value -= metric(cases.get(f"direct-c{level}"), name, quantile) or 0.0
            xs.append(level)
            ys.append(value)
        return xs, ys

    # Added latency before the request reaches the upstream.
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for run_name, cases in runs:
        for quantile, style in (("p50", "-o"), ("p99", "--s")):
            xs, ys = sweep_series(cases, "pre_upstream_ms", quantile, subtract_direct=True)
            if xs:
                ax.plot(xs, ys, style, label=f"{run_name} {quantile}")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Added latency before upstream (ms)")
    ax.set_title("Gateway added latency (100 KB request, telemetry on)")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out, "added-latency.png"), dpi=150)
    plt.close(fig)

    # Time to first token, direct vs gateway.
    fig, ax = plt.subplots(figsize=(8, 4.5))
    xs, ys = [], []
    for level in levels(primary, "direct-c"):
        xs.append(level)
        ys.append(metric(primary[f"direct-c{level}"], "ttft_ms", "p50"))
    ax.plot(xs, ys, "-o", color="black", label="direct to mock p50")
    for run_name, cases in runs:
        for quantile, style in (("p50", "-o"), ("p99", "--s")):
            xs, ys = sweep_series(cases, "ttft_ms", quantile)
            if xs:
                ax.plot(xs, ys, style, label=f"{run_name} {quantile}")
    ax.set_xscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Time to first token (ms)")
    ax.set_title("TTFT (mock TTFT 20 ms)")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out, "ttft.png"), dpi=150)
    plt.close(fig)

    # Per-chunk forwarding lag.
    fig, ax = plt.subplots(figsize=(8, 4.5))
    xs, ys = [], []
    for level in levels(primary, "direct-c"):
        xs.append(level)
        ys.append(metric(primary[f"direct-c{level}"], "chunk_lag_ms", "p99"))
    ax.plot(xs, ys, "-o", color="black", label="direct to mock p99")
    for run_name, cases in runs:
        for quantile, style in (("p50", "-o"), ("p99", "--s")):
            xs, ys = sweep_series(cases, "chunk_lag_ms", quantile)
            if xs:
                ax.plot(xs, ys, style, label=f"{run_name} {quantile}")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Chunk written by mock → received by client (ms)")
    ax.set_title("Per-chunk streaming lag")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out, "chunk-lag.png"), dpi=150)
    plt.close(fig)

    # Gateway memory and CPU across the sweep.
    fig, (mem_ax, cpu_ax) = plt.subplots(2, 1, figsize=(10, 6), sharex=True)
    offset = 0.0
    ticks = []
    for level in levels(primary, "gateway-c"):
        rows = primary[f"gateway-c{level}"]["resources"].get("ai-gateway", {}).get("rows", [])
        if not rows:
            continue
        start = rows[0][0]
        xs = [offset + r[0] - start for r in rows]
        mem_ax.plot(xs, [r[2] / MIB for r in rows], color="tab:blue")
        cpu_ax.plot([x for x, r in zip(xs, rows) if r[3] is not None], [r[3] for r in rows if r[3] is not None], color="tab:orange")
        ticks.append((offset + (xs[-1] - offset) / 2, f"c={level}"))
        offset = xs[-1] + 5
        mem_ax.axvline(offset - 2.5, color="grey", alpha=0.3)
        cpu_ax.axvline(offset - 2.5, color="grey", alpha=0.3)
    mem_ax.axhline(1024, color="red", linestyle="--", label="1 GiB admission budget")
    mem_ax.set_ylabel("Anonymous memory (MiB)")
    mem_ax.set_title(f"Gateway memory and CPU during the concurrency sweep ({primary_name})")
    mem_ax.legend(loc="upper left")
    mem_ax.grid(True, alpha=0.3)
    cpu_ax.axhline(2, color="red", linestyle="--", label="2 vCPU limit")
    cpu_ax.set_ylabel("CPU (cores)")
    cpu_ax.legend(loc="upper left")
    cpu_ax.grid(True, alpha=0.3)
    cpu_ax.set_xticks([t for t, _ in ticks])
    cpu_ax.set_xticklabels([label for _, label in ticks])
    fig.tight_layout()
    fig.savefig(os.path.join(out, "resources-over-time.png"), dpi=150)
    plt.close(fig)

    # Throughput and errors per concurrency.
    fig, ax = plt.subplots(figsize=(8, 4.5))
    for run_name, cases in runs:
        xs = levels(cases, "gateway-c")
        if xs:
            ax.plot(xs, [cases[f"gateway-c{x}"]["ok_rps"] for x in xs], "-o", label=run_name)
    xs = levels(primary, "direct-c")
    ax.plot(xs, [primary[f"direct-c{x}"]["ok_rps"] for x in xs], "-o", color="black", label="direct to mock")
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_xlabel("Concurrent streaming requests")
    ax.set_ylabel("Successful requests per second")
    ax.set_title("Throughput (each request streams ~210 ms)")
    ax.grid(True, which="both", alpha=0.3)
    ax.legend()
    fig.tight_layout()
    fig.savefig(os.path.join(out, "throughput.png"), dpi=150)
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--charts")
    parser.add_argument("runs", nargs="+")
    args = parser.parse_args()
    runs = []
    for spec in args.runs:
        path, _, name = spec.partition("=")
        runs.append((name or os.path.basename(os.path.normpath(path)), load_run(path)))
    # Runs made with BENCH_SKIP_DIRECT borrow the direct baseline of the first run.
    baseline = {label: case for label, case in runs[0][1].items() if label.startswith("direct-c")}
    for _, cases in runs[1:]:
        if not levels(cases, "direct-c"):
            cases.update(baseline)
    for name, cases in runs:
        print(f"## Run `{name}`\n")
        if levels(cases, "direct-c"):
            print("### Direct to mock (baseline)\n\n" + direct_table(cases) + "\n")
        if levels(cases, "gateway-c"):
            print("### Concurrency sweep\n\n" + sweep_table(cases) + "\n")
        if levels(cases, "gateway-burst") or levels(cases, "direct-burst"):
            print("### Burst\n\n" + burst_table(cases) + "\n")
        others = [label for label in cases if not label.startswith(("gateway-c", "direct-c", "gateway-burst", "direct-burst"))]
        if others:
            print("### Other scenarios\n\n" + generic_table(cases, others) + "\n")
    if args.charts:
        charts(runs, args.charts)


main()
