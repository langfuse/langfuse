# Corrected second-pass results

> This file preserves the earlier zero-delay CPU-stress experiment. Its burst
> cases are useful as a runtime ceiling, but they are not a normal LLM traffic
> model and should not decide the runtime on their own. The synthetic
> fixed-cadence, coding-agent-shaped follow-up and current recommendation are in
> [REALISTIC_RESULTS.md](./REALISTIC_RESULTS.md).

Run on 2026-08-26 on an arm64 macOS 26.6.1 host with Docker Desktop Engine
29.7.2. The Docker Linux VM exposed 14 CPUs and 8,318,976,000 bytes of memory.

These results are directional local evidence, not production sizing data. Each
cell is the median of three 15-second measured windows. Every scenario also had
an unmeasured warm-up. The load was closed-loop and both runtimes used the same
Rust load generator, deterministic Node mock provider, and Node mock OTLP sink.

Commands:

```bash
SECOND_PASS=1 GATEWAY_CPUS=1 GATEWAY_MEMORY_LIMIT=1g \
  REPETITIONS=3 DURATION_SECONDS=15 ./run.sh

SECOND_PASS=1 GATEWAY_CPUS=4 GATEWAY_MEMORY_LIMIT=2g \
  REPETITIONS=3 DURATION_SECONDS=15 ./run.sh
```

The final corrected runs completed 1,033,688 measured requests with zero client
errors or stream-integrity failures.

## 1-CPU profile

| Scenario | Node req/s | Rust req/s | Node completion p99 | Rust completion p99 |
| --- | ---: | ---: | ---: | ---: |
| Native small, c20 | 88.62 | 89.62 | 249.22 ms | 249.50 ms |
| Native 4 MiB image, c20 | 89.35 | 90.32 | 270.93 ms | 262.88 ms |
| Translate 4 MiB image, c20 | 56.42 | 80.00 | 530.40 ms | 531.77 ms |
| Translate burst, c20 | 951.82 | 1,037.96 | 56.38 ms | 22.12 ms |
| Translate burst, c100 | 1,010.20 | 947.39 | 138.75 ms | 114.48 ms |
| Translate burst, c500 | 955.77 | 959.02 | 10,007.02 ms | 861.89 ms |

The fixed-cadence native cases have equivalent throughput. On the native large
case, however, Node used a median 13.34 CPU-seconds per window versus Rust's
3.63, and its lifetime cgroup peak was 315.52 MiB versus 210.20 MiB. For large
translation, Rust delivered 41.8% more requests per second. At c500, throughput
was equal but Node's end-to-end p99 included roughly ten seconds of queueing.

## 4-CPU profile

| Scenario | Node req/s | Rust req/s | Node completion p99 | Rust completion p99 |
| --- | ---: | ---: | ---: | ---: |
| Native small, c20 | 89.70 | 89.41 | 248.19 ms | 248.95 ms |
| Native 4 MiB image, c20 | 89.85 | 89.25 | 263.80 ms | 256.82 ms |
| Translate 4 MiB image, c20 | 75.08 | 86.49 | 373.73 ms | 268.27 ms |
| Translate burst, c20 | 1,472.22 | 4,045.78 | 17.78 ms | 8.85 ms |
| Translate burst, c100 | 1,434.23 | 4,010.73 | 77.51 ms | 52.27 ms |
| Translate burst, c500 | 1,484.90 | 3,657.29 | 5,803.20 ms | 224.63 ms |

For CPU-heavy burst translation, Rust scaled from one to four CPUs by 3.90x at
c20, 4.23x at c100, and 3.81x at c500. The single Node process improved by
1.55x, 1.42x, and 1.55x respectively. Rust was 2.75x to 2.80x faster at c20 and
c100 and 2.46x faster at c500. The mock provider consumed only 6.61-6.80 CPU
seconds in the median Rust burst windows, well below their 15-second wall time;
it was not CPU-saturated.

## Telemetry overload signal

The publisher is intentionally minimal: one sequential publisher with a bounded
queue. Under fixed-cadence traffic both implementations delivered 100% of
spans. Under zero-delay saturation the median delivery rates were:

| Profile | Runtime | c20 | c100 | c500 |
| --- | --- | ---: | ---: | ---: |
| 1 CPU | Node | 15.5% | 8.3% | 7.8% |
| 1 CPU | Rust | 100.0% | 74.8% | 20.4% |
| 4 CPU | Node | 12.9% | 6.4% | 5.3% |
| 4 CPU | Rust | 48.3% | 34.1% | 15.2% |

This is not a production telemetry design comparison. It shows that telemetry
publication becomes an independent bottleneck and needs batching, parallelism,
or an explicitly accepted drop policy before production.

## Historical recommendation from this stress pass

For this zero-delay stress shape, Rust is the stronger data-plane runtime. The
later fixed-cadence runs showed that this conclusion does not transfer
directly to expected gateway traffic: Node remains healthy much further into a
realistic stream envelope, and telemetry placement materially changes its tail
latency. Treat the current recommendation in `REALISTIC_RESULTS.md` as
authoritative.

Before turning these ratios into capacity or SLO claims, repeat the selected
design on dedicated Linux infrastructure with an open-loop load model and
production-shaped telemetry batching.

## Corrections applied before the final run

- Enabled TCP_NODELAY consistently on accepted and outbound connections.
- Serialized OTLP once into byte-backed queues and tracked queued bytes in O(1).
- Released Node's parsed large JSON tree at the same pre-upstream-await boundary
  as Rust.
- Cached the mock provider's serialized SSE frames so mock JSON construction did
  not dominate zero-delay saturation.
- Recorded per-window cgroup CPU/throttling deltas and documented warm-up/lifetime
  metric boundaries.
