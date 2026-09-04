# Synthetic fixed-cadence Node vs. Rust gateway results

> Historical result: this report compares Node 24, an IPC experiment, and
> Rust. The later byte-identical Node 24 vs. Node 26 vs. Rust rerun materially
> changes the runtime recommendation. See
> [NODE26_RESULTS.md](./NODE26_RESULTS.md) for the current conclusion.

## Context

The earlier benchmark established a useful CPU ceiling with zero-delay streams,
but it could not answer when Node degrades under long-lived LLM-shaped traffic.
This follow-up uses synthetic fixed-cadence streams, staggered starts,
coding-agent-sized requests, protocol translation, and batched telemetry. It
compares:

- Node with inline telemetry work;
- Node with a forked telemetry worker over IPC; and
- Rust with four Tokio workers.

Every gateway receives the same aggregate 4-CPU/2-GiB container envelope. Runs
were local on Docker Desktop on 2026-08-26. They are suitable for comparing
runtime behavior, not for production pod sizing.

## Workload

The mixed input distribution is deterministic: 60% 103-KB text requests, 30%
570-KB text requests, and 10% 5.9-MB media requests. The weighted request size
is 824 KB. Requests contain long coding context, system/developer messages,
multi-turn tool history, eight tool schemas, and optional base64 media.

In translation mode every request is parsed, mapped from OpenAI Chat
Completions to Anthropic Messages, and serialized. Each Anthropic response has
100 streamed content events split between text and tool arguments. Each
data-bearing SSE frame is incrementally framed and parsed; supported text, tool,
finish, and usage events are mapped and serialized back to OpenAI SSE. Each
completed request also creates a bounded OTLP-shaped span. Telemetry batches at
50 spans or 250 ms.

Workers are started uniformly over five seconds. At steady state, 500 streams
with 25-ms content cadence represent approximately 20,000 content events/s and
200 request completions/starts per second. With the fixture mix, that implies
roughly 165 MB/s of serialized request input before response and telemetry work.
The 50-ms case halves those rates.

## Results

### Central fixed-cadence controls

These controls were recorded before the final Node capture-ownership correction.
All variants completed every request with zero transport errors and the exact
expected content-event counts and bytes, finish marker, and `[DONE]` marker.
Because the correction only removes retention work from Node, these results are
conservative for Node, but they are not final-build repetitions.

| Case | Node inline p99 TTFT | Node IPC p99 TTFT | Rust p99 TTFT | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Native OpenAI, c500, 50 ms | 21 ms | 14 ms | 9 ms | All healthy; byte-streaming control |
| Translate, c500, 50 ms | 33 ms | 25 ms | 24 ms | All healthy; completion p99 was cadence-bound at 5.2 s |
| Translate, c500, 100 ms | 22 ms | 21 ms | 26 ms | All healthy; completion p99 was cadence-bound at 10.3 s |

At c20 and 100-ms cadence, request size barely affected completion latency. For
the 103-KB, 570-KB, and 5.9-MB fixtures, p99 TTFT across runtimes remained below
10 ms, 14 ms, and 46 ms respectively; completion stayed near the 10-second
configured stream floor.

The native control covers OpenAI Chat Completions passthrough. It does not cover
native Anthropic Messages or establish the performance of the first Claude
Code-to-Anthropic vertical slice.

The practical correction is important: Node did **not** start degrading at 20
concurrent streams, and it was not overwhelmed at 500 streams at the 50-ms or
100-ms cadences.

### Dense 25-ms boundary

The table shows p99 TTFT ranges across repeated staggered runs. All listed runs
completed with zero transport errors and matched the expected content
counts/bytes, finish marker, and done marker.

| Concurrent streams | Node inline | Node IPC | Rust |
| ---: | ---: | ---: | ---: |
| 350 | 44–46 ms | 28 ms | 24–25 ms |
| 375 | 42–44 ms | 28–29 ms | 24–25 ms |
| 400 | 56–65 ms | 30–31 ms | 20–25 ms |
| 450 | 82–106 ms | 37–40 ms | 20–24 ms |
| 500 | 89–168 ms | 48–49 ms | 19–25 ms |

These figures supersede earlier runs that retained both captured request buffers
and a decoded request string for the duration of the stream. Response
duplication was only transient at teardown. The final implementation transfers
buffer ownership to telemetry before publishing, which makes the runtime
comparison fairer and substantially improves Node.

Inline Node's onset is bracketed for this local setup. At c350 and c375 it has
a roughly 20-ms absolute p99 gap to Rust, but no rising curve. The bend appears
at c400; c450 is the first point where a repetition exceeds 100-ms p99; c500 is
variable at 89–168 ms. Thus:

- for a 50-ms p99 TTFT budget in this benchmark, the tested Node envelope ends below
  c400;
- for a 100-ms budget, c450 is marginal and c500 is outside the budget; and
- Node was not fully overwhelmed in any corrected inline run through c500.

At c500, Node completion p99 was 2.73–2.79 s versus 2.65–2.71 s for Rust. All
corrected runs completed with zero request errors. The behavior is consistent
with sustained event-loop queueing, but the benchmark does not directly prove
that every millisecond originates in the gateway rather than host or mock
scheduling.

This boundary is a workload rate, not a universal stream count. At 25 ms, c400
means about 16,000 steady content events/s and roughly 132 MB/s of request input;
c500 means about 20,000 events/s and 165 MB/s. A pod carrying slower responses,
smaller prompts, or fewer request completions per second can support more open
streams without the same CPU pressure.

### Long-lived 50-ms stream boundary

The central 50-ms cadence exposes a second pressure axis: how much request and
telemetry state remains live while the provider is streaming. In particular,
c1000/50-ms and c500/25-ms both represent approximately 20,000 content events/s,
200 request starts/completions per second, and 165 MB/s of request input. The
c1000 case holds twice as many requests and telemetry previews open for roughly
twice as long.

The full workload below uses the final implementation and the 2-MiB-per-side
telemetry capture limit. c825 and c850 have two Node repetitions; c1000 has two
Node and three Rust repetitions. c750, c800, and c875 have one measured
repetition, each preceded by a warm-up.

| Streams | Node p99 TTFT | Rust p99 TTFT | Node p99 completion | Rust p99 completion |
| ---: | ---: | ---: | ---: | ---: |
| 750 | 78 ms | 23 ms | 5.26 s | 5.20 s |
| 800 | 82 ms | — | 5.27 s | — |
| 825 | 86–91 ms | — | 5.27–5.29 s | — |
| 850 | 123–157 ms | — | 5.31–5.34 s | — |
| 875 | 634 ms | 25 ms | 5.77 s | 5.21 s |
| 1,000 | 1.03–1.09 s | 20–25 ms | 6.16–6.22 s | 5.19–5.27 s |

Node completed every measured request in these runs. Its 100-ms p99 boundary
is therefore bracketed between c825 and c850 for this exact workload, and the
tail collapses rapidly beyond it. This is latency overload before request
failure. Rust's successful-request p99 remained nearly flat. One of three Rust
c1000 measured runs had one load-generator timeout; it was not reproduced, and
the gateway reported completing every attempt with zero failures.

Container lifetime peaks show why active streams matter:

| Streams | Node peak | Rust peak |
| ---: | ---: | ---: |
| 750 | 1.42 GiB | 0.77 GiB |
| 875 | 1.62 GiB | 0.90 GiB |
| 1,000 | 1.82–1.85 GiB | 0.97–1.01 GiB |

At c1000, changing only the telemetry capture limit and translation mode
separates the main costs:

| Node c1000/50-ms control | p99 TTFT | Container peak | Interpretation |
| --- | ---: | ---: | --- |
| Translate, 2-MiB capture | 1.03–1.09 s | 1.82–1.85 GiB | Full workload |
| Translate, 256-KiB capture | 538 ms | 1.50 GiB | Smaller live telemetry state helps materially |
| Translate, 1-byte capture | 283 ms | 1.14 GiB | Parent translation/connection work still queues |
| Native OpenAI, 1-byte capture | 32 ms | not sampled | Raw proxying itself remains healthy |

The conclusion is narrower than “Node cannot hold 1,000 streams.” Node can
proxy 1,000 streams in this setup. Its tail collapses when those streams also
combine high-volume request translation with large live telemetry previews.
Telemetry retention explains most of the excess and translation explains most
of the remainder. Connection and host scheduling are still included in TTFT,
so this experiment does not assign every millisecond to one function.

### What IPC proves—and does not prove

The IPC child performs capture concatenation/UTF-8 conversion, OTLP object
construction, batch JSON serialization, and HTTP publication. The gateway
parent still performs request/response translation and pays IPC
serialization/copying.

Moving telemetry off the main event loop removed most of the inline Node tail
cliff across the full c350–c500 boundary. The parent still performs all request
and response translation, so this is strong evidence that translation alone is
not what drives the nonlinear Node tail in this fixture. It also shows that
Node can use multiple cores when CPU-heavy auxiliary work is split into
processes.

The cost is material. One final c500/25-ms sample measured gateway-cgroup CPU
from the start of the measured load until its telemetry queue drained. Memory
is the cgroup lifetime peak, including warm-up. The IPC row includes both Node
processes:

| Variant | Completions | Gateway CPU | CPU/completion | Container peak |
| --- | ---: | ---: | ---: | ---: |
| Node inline | 1,666 | 13.02 CPU-s | 7.82 ms | 1.13 GiB |
| Node IPC | 1,699 | 17.00 CPU-s | 10.01 ms | 1.28 GiB |
| Rust | 1,702 | 8.35 CPU-s | 4.90 ms | 0.60 GiB |

This is one local repetition rather than a production cost model, but the
nearly equal completion counts make the direction clear: the IPC split buys
latency isolation by adding copying and a second heap; it does not buy
efficiency. Rust used about 37% less CPU per completion than inline Node and
about half the container memory in this sample.

One earlier IPC c500 run was OOM-killed, while multiple later runs with
essentially the same count-only IPC memory risk succeeded. It is therefore an
unreproduced outlier, not evidence for a deterministic c500 threshold. It is
still a warning about count-only queue bounds: copying large facts between two
heaps and materializing JSON batches can amplify memory unless production
queues and batches are bounded by bytes as well as span count.

The current raw-facts IPC implementation is therefore useful as an isolation
experiment, but is not a production recommendation without reducing capture
amplification and adding a byte-aware batch bound.

At c1000/50-ms, the limitation shifts into the parent. With the 2-MiB capture,
the IPC container was OOM-killed with exit code 137; the resulting closed-loop
retry storm recorded 298 completions and 8,604 connection/timeout errors. With
the capture reduced to 256 KiB, IPC survived but had 556-ms p99 TTFT, nearly
identical to inline Node's 538 ms. Moving telemetry serialization off-loop
therefore helps the c350–c500 dense regime, but it neither fixes parent-side
translation pressure nor provides a safe high-concurrency memory model.

## Translation realism audit

The fixture is a synthetic, plausible OpenAI function-calling coding-agent
shape intended to exercise likely CPU and allocation hotspots:

- parsing large OpenAI request JSON;
- walking and allocating system, developer, user, assistant, and tool-result
  blocks;
- parsing assistant tool arguments and mapping eight tool schemas;
- scanning and normalizing base64 image data URLs;
- serializing the full Anthropic request;
- incrementally framing SSE across arbitrary transport chunks;
- parsing every data-bearing Anthropic frame and serializing supported OpenAI
  text/tool deltas;
- mapping finish reasons and usage; and
- capturing input/output and serializing OTLP telemetry.

A text-only response sensitivity run before the final capture correction showed
the same runtime direction. Its old absolute numbers are not used as current
capacity evidence, but it suggests that the tool-delta branch is not the sole
source of the inline-Node tail.

The two translators are comparable rather than instruction-for-instruction
identical. Rust performs some extra JSON cloning and wraps string tool results
as text blocks; Node preserves those results as strings and performs more
Buffer/string conversion. The measured Rust advantage is therefore not caused
by an obviously simpler translation path, but this remains a comparison of two
concrete implementations rather than a pure language microbenchmark.

The translator is still intentionally incomplete. It does not cover every
OpenAI content type or provider extension, multiple streamed choices,
schema-library validation, all error shapes, TLS, auth, or dynamic destination
lookup. Both translators track indexed tool blocks, but the response fixture
exercises one streamed tool call and the load generator validates only
`tool_calls[0]`; multiple or interleaved streamed tool calls are not
benchmark-validated. The mock upstream drains but does not semantically
validate every translated request; focused unit tests cover representative
mapping branches used by the fixture. Real providers also produce burstier
event timing, pings, thinking, citations, and errors. Production-shaped events
and timing could change CPU and tail behavior; media extraction/reference
handling could reduce telemetry memory. Most importantly, the 60/30/10 payload
distribution and 25/50/100-ms cadences are assumptions, not measurements of
Langfuse production traffic.

## Problem

Rust has a clear efficiency and successful-request tail-latency advantage in
the measured envelope, but a new backend language adds hiring, review, library,
debugging, deployment, and on-call cost. The benchmark only justifies paying
that cost if the gateway must meet a per-pod envelope where Node's tail becomes
unstable—or if the team values the additional headroom and lower steady-state
resource cost enough to pay for it before traffic data is available.

The results do not support the simpler claim that “Node fails around 20
concurrent streams.” They also do not support “Node only has a burst problem.”
Simultaneous arrivals make Node worse, but sufficiently dense staggered traffic
also causes sustained event-loop queueing.

## Recommendation

Use Node for the V1 if the architecture will enforce and autoscale on a tested
per-pod envelope. With the full fixture and a 2-MiB capture, a 100-ms p99 budget
was met at c825 and missed at c850; an operational target needs substantial
headroom below that observed cliff. Active streams alone are insufficient for
autoscaling: also track request starts/s, input bytes/s, provider events/s,
retained telemetry bytes, event-loop delay, and memory.

If V1 is dominated by passthrough and translated traffic remains below the
tested envelope, Node has the stronger overall tradeoff: the team already
operates it, native passthrough is cheaper than the translated stress case, and
even translated traffic remained healthy at c500 with 50–100-ms cadence. Keep
telemetry batched, bound capture, queues, and batches by bytes, extract or
reference media early, and shed/admit load before an instance reaches its
validated envelope. Do not use the raw-facts IPC prototype unchanged.

Choose Rust now if planning for the measured local 850–1,000-stream synthetic
envelope, if the service cannot depend on tight admission control and scale-out
headroom, or if roughly 37% lower CPU per completion at c500 and about half the
observed memory at c1000 outweigh the language ownership cost. Rust's
successful-request p99 remained nearly flat through the corrected dense and
long-lived runs; the isolated client timeout prevents a stronger reliability
claim.

The remaining decision gate is empirical traffic calibration: measure request
size, stream duration, SSE events/s, request starts/s, and concurrent streams
per future gateway pod. Add a native Anthropic Messages control and replay the
observed distribution against an explicit end-to-end p99 TTFT budget. Without
that traffic envelope, the results are strong directional evidence for Rust
within the measured local high-density envelope, but not yet proof that
Langfuse V1 will operate there often enough to justify a new backend language.
