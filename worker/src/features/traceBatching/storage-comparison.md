# Readiness storage measurements

Synthetic local experiments, 11–12 October 2026. These short runs compare storage
and Redis operations; they do not certify production capacity or the multi-hour
load-test thresholds. The full experimental scripts, raw JSON, research report
and sanitized Node CPU profile remain local for review. The selected production
load driver is `worker/src/scripts/traceBatchReadinessLoad.ts`.

## Selected structure

- Per shard: `{trace-batch:<shard>}:due` sorted set and `:state` JSON hash.
- Retained history: `:first:<hour>` bucket hashes. Fields are 16-byte identity
  digests; values are MessagePack `[minStart,maxStart,expiresAt]` (28 bytes at
  current epoch timestamps). Historical maximum protects backdated late arrivals.
- Valid pending state carries its history-bucket pointer, avoiding repeated
  searches across the retention window. Missing pending/pointer uses bounded
  bucket lookup. Logical expiry protects reads; whole-key TTL reclaims buckets
  without scanning fields. Physical deletion can lag logical expiry by one hour.
- Hash the complete project/trace identity, rather than project alone. All keys
  passed to each Lua invocation share one hash tag. One dispatcher lease covers
  all shards; the default shard count is one.
- TRACK/HYDRATE/ACK call sizes are 50; cleanup removes at most 100 per call.
  Cached EVALSHA falls back to EVAL on NOSCRIPT. Each Lua call is atomic on its
  primary. Queue enqueue and acknowledgement remain separate, with revision guards.
- Pending expiry is `due + recovery grace` (two hours by default), so increasing
  project idle duration cannot expire state before it becomes due. Successful
  acknowledgement clears pending entries promptly.

MessagePack is built into the [Redis Lua API](https://redis.io/docs/latest/develop/programmability/lua-api/).
Scripts block other commands on their primary while running; atomicity does not
extend across Redis, BullMQ and ClickHouse. See [Redis scripting semantics](https://redis.io/docs/latest/develop/programmability/eval-intro/).

## Hardware and method

Apple M5 Max, 18 host cores, 64 GiB RAM; Node 24.6.0 via mise. Redis OSS 7.2.4
in Docker, single-node maxmemory 512 MiB, noeviction, RDB/AOF disabled,
`lazyfree-lazy-expire no`, slowlog threshold 1 ms. Isolated Cluster correctness
checks use three primaries and three replicas on the same host.

Final single-node measurements prefilled one million retained identities and
20,000 pending traces. Target 1,200 traces/s, two five-event ingestion updates
per trace, 30% single-project skew, 5% late arrivals. Project idle durations were
compressed to 1/2/3 seconds. The prototype dispatcher checks every 250 ms,
hydrates and acknowledges; it does not enqueue BullMQ jobs, read ClickHouse or
call models. History population is identical for 24h and 48h comparisons, so
these runs isolate lookup cost; real 48h capacity roughly doubles population.

History allocation uses retained-only INFO used_memory growth, including key
and expiry dictionaries. Pending bytes sum MEMORY USAGE of due/state. These
are incremental allocations, not RSS or instance reservations. Client CPU and
profiles include synthetic generation/bookkeeping, not production tracking alone.
Script p99 is from slowlog samples; sub-millisecond operations are omitted.

## Actual production Lua

| Retention / measured duration | Redis CPU, one core | History allocated B/trace |   Pending B/trace | Script p99 / max ms | Scripts >10 ms | Redis-only 20k drain ms |
| ----------------------------- | ------------------: | ------------------------: | ----------------: | ------------------: | -------------: | ----------------------: |
| 24h / 10s                     |              12.91% |                     98.37 |            508.02 |      2.617 / 11.302 |   **1 (FAIL)** |                     492 |
| 48h / 10s                     |              16.52% |                     98.60 |            504.82 |       3.420 / 9.039 |              0 |                     522 |
| 24h / 60s CPU profile         |              13.49% |         approximately 100 | approximately 508 |       2.683 / 8.543 |              0 |                     485 |

All three synthetic ledgers reported zero lost, duplicate or wrong-bound
acknowledgements. The 60-second repeat admitted and acknowledged 71,950 traces.
The earlier 11.302 ms failure remains a failed threshold despite the clean repeat.
The profile is the Node benchmark client, not Redis server CPU.

## Alternatives

Same one-million-history/20k-pending setup; 10-second phases, 50-entry frames.

| Historical shape                                            | Allocated B/trace |                    Redis CPU at 24h / 48h | Main tradeoff                                  |
| ----------------------------------------------------------- | ----------------: | ----------------------------------------: | ---------------------------------------------- |
| Large packed hourly buckets with pointer                    | approximately 100 | 10.7% / 14.6% (frozen comparison scripts) | Chosen memory/CPU compromise                   |
| Packed string key per trace with native TTL                 |               171 |                               8.4% / 9.5% | Faster lookup, exceeds 120 B history budget    |
| Subdivided listpack buckets, approximately 128 entries each |             53–54 |                             23.3% / 29.5% | Lower memory, many more keys and script groups |

Subdivisions produced approximately 28–32k EVALSHA calls per ten seconds, versus
roughly 1.9k calls in actual production-script probes, and slower initial drain.
They recorded one 10.146 ms script at 48h. Large-bucket 100-entry calls reached
p99 5.268 ms at 48h, exceeding the 5 ms target; 50 is the selected call bound.
A separate large-bucket control had one 18.573 ms script at 24h. No thresholds
were relaxed. All measurements are in [the comparison CSV](readiness-benchmarks.csv).

A hash plus expiry sorted set adds memory and cleanup ownership. WATCH on shared
hashes caused unrelated traces to conflict (7.93 retries/update, p99 119 ms at
32 concurrent writers). Per-trace WATCH avoids that false conflict but still
retries on hot traces. Lua preserves atomic bounds, due and revision updates
without client read/write races.

An expiry experiment on one million entries showed a large-bucket synchronous
expiry pause around 173 ms. Lazy expiry freeing improved one repeat from about
168 ms to 2.4 ms, but small-bucket results varied. Production lazyfree settings
and expiry cohorts need separate validation before rollout.

## Capacity estimate

Use approximately 100 B/history entry and 508 B/pending trace, with steady
arrivals and 15–30 minutes pending residence. History expiry refreshes on
tracking/ack, so residence includes that pending interval plus retention.
Rounded decimal GB, primary data only:

| Retention | 100M traces/day | 30% opt-in |
| --------- | --------------: | ---------: |
| 24h       |    10.6–11.3 GB | 3.2–3.4 GB |
| 48h       |    20.6–21.3 GB | 6.2–6.4 GB |

Each additional hour of pending residence adds approximately 2.1 GB pending and
0.42 GB history at 100M/day (30% scales both by 0.3). These estimates exclude
allocator/RSS headroom, bucket rounding, replication, queues and Topics retry
markers/result staging. One full replica adds another copy of the dataset.
Shard count changes distribution, not aggregate dataset size. An earlier
102 B/entry estimate meant 10.2 GB for 100M retained entries, not additional RAM
on top of another history map. Topics retry state is a separate budget.

## Correctness and remaining validation

The existing Redis/ClickHouse suite covers late windows, historical earliest and
latest bounds, replacement summaries, retry model-call idempotency, revisions,
expiry, oversized exclusion and dispatcher lease. No project idle setting is
persisted yet; the tracking boundary accepts an effective duration and ingestion
uses the deployment fallback. A future nullable typed Project field is the
simplest owner; session idle can get its own field when implemented.

The existing Topics ORDER BY includes `toStartOfMinute(unit_start_time)`.
Replacement is guaranteed only while that minute remains stable. A late event
revealing a genuinely earlier start in a different minute can leave the old
summary under its earlier sort identity. This contradicts an unconditional
same-key replacement expectation; no ClickHouse schema change is made here.
See [ReplacingMergeTree uniqueness](https://clickhouse.com/docs/concepts/features/operations/update/replacing-merge-tree).

Rolling deployment requires the README stop-and-drain procedure. Legacy
minimum-only values remain readable but cannot reconstruct a forgotten maximum.
Changing shard count requires another drain.

The due ZRANGE still returns the full ready cohort; the Lua call cap does not
bound its response or sorting allocation. Bucket keys are selected using a
separate Redis TIME call; an unusually stalled call outside the declared range
is logged without automatic retry. Short runs did not exercise multi-hour
retention, 1.8k/s headroom, a 15-minute dispatcher stall, production RSS stability,
failover loss, persistence/replication overhead or production worker CPU. The
BullMQ queue remains one slot. Dedicated Redis sizing remains an operational
decision requiring those measurements.
