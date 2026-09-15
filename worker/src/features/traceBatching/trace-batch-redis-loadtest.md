# Trace-batch Redis load test — 2026-09-15

## Decision

Start the first experiment at **10% deterministic sampling and 120 traces per
job**. Normal tracking CPU is modest in this isolated test, but retained state
and stopped-consumer queues can consume substantial memory. This is evidence
for a gradual rollout, not production capacity certification.

The benchmark uses synthetic local data and executes the production tracking
and cleanup Lua extracted from `traceBatching.ts`. It never loads app env,
connects to ClickHouse, or uses production services/data.

## Evidence provenance

The checked-in JSONL files are the original 2026-09-15 measurements preserved
from [the full experiment PR](https://github.com/langfuse/langfuse/pull/17484)
at commit `2d9c82ab053a7330f000480b74c94e3b58e2aad1`. Their `sourceSha256`
identifies the production source used during measurement; it is not the hash
of this baseline's source file. They have not been relabeled as fresh runs.

The extracted `TRACK_SCRIPT` and `SNAPSHOT_SCRIPT`, after expanding their shared
cleanup script and chunk size, are byte-for-byte identical to baseline
`f8366ddd5ca3bda4761e05d15883ca0072a0d946`. Their SHA-256 digests are:

- Tracking: `23aabd5749609935a57736f44d03b294c7733df6f40c4ca7eca62d053835d9e0`
- Snapshot: `904474bfe932b7e276f47e9df8369a9f8349e38464e162aff71088b056433840`

The same Redis structures and measured Lua therefore apply to this baseline.
This does not establish equivalence of the full dispatcher or reader. The
harness now emits both extracted-script digests so later runs can compare them
independently of unrelated changes to the containing TypeScript file.

## Setup and scope

- Apple M5 Max, Node 24.6.0, Docker/OrbStack; each server limited to one CPU and
  6 GiB memory, `maxmemory=5gb`, `noeviction`, no persistence or replica.
- Redis 7.2.4 and Valkey 8.1.10, each in a separate disposable container. Results
  include the exact server versions and production-source SHA-256.
- 10,000 generated project IDs of 25 characters; random-looking 32-character
  trace IDs; 36-character revisions; two numeric timestamps. No event payloads.
- Two separate observations per trace, including a fresh revision and state
  merge on the second update. Coalescing observations within one ingestion job
  can reduce Redis calls further; this benchmark does not rely on coalescing.
- Full admission for all measured workloads. Tests at 695 and 1,852 events/s
  approximate 30M and 80M traces/day at two events/trace. A 10-second
  18,520-events/s burst tests 10× the higher arrival rate.
- A 1M-entry preload, then a 6,944,445-entry preload, exercises nonempty maps.
  Bulk population uses the production maximum of 1,000 traces per Lua call;
  paced traffic uses one Lua call per observation, pipelined in small bursts
  to model concurrent producers.
- CPU comes from server `INFO cpu`, including probes/background work. A
  two-millisecond probe loop measures end-to-end PING latency. It shares the
  load generator's event loop, so client parsing/scheduling can affect latency.

The harness measures Redis tracking, retained state, range reads, cleanup and
real BullMQ waiting-job storage. It does **not** measure application sampling
CPU, locality selection, full dispatcher throughput, query performance, TLS,
replication, failover, persistence or interference with existing production queues.

## Memory and retention

| Retained traces | Redis 7.2.4 allocated | Valkey 8.1 allocated |
| --------------- | --------------------: | -------------------: |
| 100,000         |                 40 MB |                36 MB |
| 1,000,000       |                384 MB |               354 MB |
| 2,500,000       |              1,000 MB |               871 MB |
| 6,944,445       |              2,676 MB |             2,390 MB |

Values are `INFO used_memory`, decimal MB; server baseline ~1 MB.
Largest-run RSS was 2,691 MB / 2,405 MB respectively. Both map keys had matching native TTLs
approximately 7,200,000 ms after writes. `MEMORY USAGE` estimates for each key
are included in the raw results; planning uses measured total allocations.

Use roughly **400 bytes per retained trace** as a planning estimate for this
fixture, before replication, other queues, allocator headroom and longer IDs.
All pending keys share one hash slot, so their load lands on one primary.

| Scenario per cluster                                    |         30M traces/day |         80M traces/day |
| ------------------------------------------------------- | ---------------------: | ---------------------: |
| Events/second at two events/trace                       |                    694 |                  1,852 |
| Pending traces, 5-minute idle + up to 60-second cadence |                125,000 |                333,333 |
| Approximate pending memory at full admission            |                  50 MB |                 133 MB |
| Approximate pending memory at 10% admission             |                   5 MB |                  13 MB |
| Stalled dispatcher, 125 minutes at full admission       | 2.60M traces / 1.04 GB | 6.94M traces / 2.78 GB |
| Same stalled-dispatcher model at 10% admission          |                 104 MB |                 278 MB |

These are arrival-rate models, **not hard limits**. They assume short-lived
traces, stable traffic and one admission window per trace. Late observations,
long-lived traces, skew, repeated reactivation and dispatch lag change occupancy.
Pending state stores bounds/revisions, not per-trace observation counts or
byte estimates. More events increase write work and can extend residence even
though they do not append event payloads to Redis.

## CPU, large reads and expiry

| Workload                        | Redis 7.2.4 CPU | Valkey 8.1 CPU |
| ------------------------------- | --------------: | -------------: |
| Idle + probes                   |            1.4% |           1.9% |
| 695 events/s, 1M preload        |            4.0% |           4.6% |
| 1,852 events/s, 1M preload      |            7.2% |           7.1% |
| 18,520 events/s requested burst |           31.8% |          31.3% |
| 1,852 events/s, 6.94M preload   |            7.3% |           7.1% |

Percentages are of one core and include probe overhead. Both burst runs
achieved approximately 18,510 events/s. These are measured local rates, not
production throughput limits or a linear scaling guarantee. Valkey's PING p99
was 1.6 ms at 1,852 events/s with 1M preloaded traces (maximum 23.8 ms).

Reading 6.94M IDs returned 444 MB of member strings, took 1.21 seconds end to
end, and observed a 184 ms maximum probe delay. Production also parses/sorts
that full list; this range-only benchmark excludes that additional work.
Bounded pruning removed 100,000 expired members in 100 calls, 137 ms total,
with a 1.6 ms maximum probe delay.

Valkey's 6.94M-ID read took 1.12 seconds, 214 ms of server CPU, and observed a
541 ms maximum probe delay. That delay includes the host's parsing/scheduling;
it is not an isolated server stall measurement. The response is still large
enough to warrant avoiding million-trace dispatch backlogs. Valkey's bounded
100,000-member pruning took 137 ms with a 2.6 ms maximum probe delay.

**Native expiry of giant keys needs asynchronous freeing.** With Redis 7.2.4's
`lazyfree-lazy-expire=no`, expiring the two keys holding 6.84M traces observed
a **1.85-second maximum probe delay**. TTL cleaned up the keys autonomously,
but synchronous deallocation stalled the server. The harness shortens TTL to
100 ms for this phase; it does not wait two hours or change production TTL.

Valkey 8.1 defaults to asynchronous freeing, as documented in its
[configuration source](https://raw.githubusercontent.com/valkey-io/valkey/8.1/valkey.conf).
The local Valkey run confirmed `lazyfree-lazy-expire=yes`: both keys were
invisible at the first check (~201 ms), all background freeing completed by
1.10 seconds, and the maximum PING delay throughout expiry/freeing was
**0.82 ms**. Background freeing still consumed CPU (~947 ms) and retained memory
until reclamation finished. Queue memory tests waited for freeing to finish.
Check the actual engine/configuration when enabling the experiment on other
Redis installations. The native TTL feature itself requires Redis 7+.

## Queue storage and batch cap

The real BullMQ test enqueued 120,000 trace memberships per cap into an empty
queue, using production payload shape and retention options. No worker ran.

| Cap    |  Jobs | Redis 7.2.4 bytes/trace | Valkey 8.1 bytes/trace |
| ------ | ----: | ----------------------: | ---------------------: |
| 60     | 2,000 |                     224 |                    221 |
| 120    | 1,000 |                     214 |                    212 |
| 1,000  |   120 |                     199 |                    199 |
| 10,000 |    12 |                     227 |                    228 |

Larger caps reduce job overhead, but JSON membership dominates; allocator size
classes also matter. Moving 120 → 1,000 saved about 7%, so increasing query size
is not a strong Redis-memory remedy. Partial batches cost more per trace.
**120 is the proposed initial experiment cap; compare 1,000 later while keeping
sampling and query settings fixed. The baseline default remains 60 and supports
at most 1,000; the 10,000-cap row is a synthetic storage comparison only.** No claim about ClickHouse's optimal cap follows from this test.

Waiting jobs do not have an autonomous TTL. At ~214 bytes/membership,
80M trace memberships/day would add roughly **17 GB/day** to a stopped-consumer
queue at full admission, or **1.7 GB/day at 10%**. Two-hour stale-job rejection
only runs when a consumer picks jobs up. To stop an experiment, stop intake and
dispatch, then keep the consumer enabled with reads disabled to discard jobs.
This drains eligible waiting work; paused/delayed/failed jobs retain the
documented constraints. Sampling reduces growth; it does not impose a queue cap.

## Stable sampling

Admission imports the evaluator's `getDeterministicSamplingValue` and
`shouldSampleEvaluation` directly. The versioned SHA-256/53-bit score is keyed
by **trace ID** and compared with `< samplingRate`. Trace evaluators therefore
select the same cohort at the same rate; observation evaluators use observation
IDs and select a different cohort. There is no additional project salt.
Retries and event ordering preserve selection; higher rates contain lower-rate
cohorts. Dispatcher and worker never resample. Existing regression coverage in
`worker/src/__tests__/traceBatching.test.ts` pins cohorts, endpoints and replay.

## Reproduce

Checked-in artifacts:

- [Harness](../../../../scripts/benchmarks/trace-batch-redis.cjs)
- [Redis raw results](../../../../scripts/benchmarks/results/trace-batch-redis-2026-09-15.jsonl)
- [Valkey raw results](../../../../scripts/benchmarks/results/trace-batch-valkey-2026-09-15.jsonl)

Run from the repository with dependencies installed. Use an empty disposable
container; the harness refuses a nonempty Redis and removes only its test data.
Allow several minutes and roughly 3 GiB server memory plus client overhead.

```sh
docker run -d --name topics-local-loadtest --cpus=1 --memory=6g \
  -p 127.0.0.1:16389:6379 valkey/valkey:8.1 \
  valkey-server --save '' --appendonly no --maxmemory 5gb --maxmemory-policy noeviction
mise exec -- pnpm exec node scripts/benchmarks/trace-batch-redis.cjs 16389 > results.jsonl
docker rm -f topics-local-loadtest
```

For the compatibility comparison, use `redis:7.2.4` and `redis-server` in the
same command. No app environment or local service stack is required.
