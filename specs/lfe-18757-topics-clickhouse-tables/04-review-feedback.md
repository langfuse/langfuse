# Review feedback and answers

Points raised in the design review of these tables (issue thread and a review call on 2026-11-18), each with what we measured. Numbers are for the 1M traces/day project unless noted ([03-results.md](03-results.md)). ClickHouse docs and the running server's own setting descriptions were used to check the claims.

## Merges, key order and materialized views

**"Facet before time is a bad idea in wide tables. All writes go into all and every part. Wide rows stop merging, as with `events_full`, so the key stops paying off."**

- **Holds:**
  - Wide parts stop merging around 150 GiB (`max_bytes_to_merge_at_max_space_in_pool`). At about 2.3 KB per row that's about 70M rows per part, so a busy region has many unmerged parts.
  - Sort order exists only inside a part. The docs say a table "consists of data parts sorted by primary key", and "each part has its own primary index".
- **Doesn't hold:**
  - Time pruning across parts comes from each part's min/max of `unit_start_time`, the partition key column, whatever the key order. A 1-day filter on a facet-first table kept 7 of 55 parts.
  - Merges are picked by part size (`merge_selector_algorithm = Simple`), not by key, so part counts match across layouts.
- **What we did:** summaries keep time first (with a day bucket). Assignments put the run first, because every map read filters on one run, and a run's clustered rows span the whole window. Meeting layout vs proposal: scatter 1.3 GiB vs 35 MiB, previous-run lookup 1.2 GiB vs 25 MiB.

**"Don't put a higher-cardinality prefix before time than `events_full` has."**

The rule matches the docs (low cardinality first, `toDate(...)` second). Per project, a minute bucket is effectively high cardinality: one minute of one facet holds fewer rows than a granule, so nothing after the minute can prune. Facet pruning would start only at about 6M traces/day for a single project. With the minute bucket:
- Topics page counts read every facet (11.7 GiB vs 2.9 GiB).
- A stable refit sample is a full scan (258 GiB vs 1.4 GiB).

The day bucket is the compliant version of this rule.

**"Use materialized views that only store pointers, (project, facet, trace) to timestamp, for lookups by facet or trace and for the stable sample; partition them by month."**

- **Stable sample:** the pointers find it in 14 MiB, but fetching its embeddings from the time-ordered table still reads 65.8 GiB. The sampled rows stay scattered across nearly every granule (round 1).
- **Trace lookups:** the pointer table brings the trace header lookup from 821 MiB to 33 MiB. A bloom filter on `trace_id` in the proposal reads 5 MiB without the extra table.
- **Write cost:** the pointer MV adds 77% to summary write time.
- **Where the idea does pay off:** "which topic does this trace have". The proposal adds a narrow time-ordered copy of assignments, fed by an MV, which reads 25 MiB per 100-trace page instead of about 250 MiB.

**"Remove all projections; data retention with ALTER UPDATE would break ClickHouse."**

Agreed and done in both options. Lightweight deletes of 500 units without a time range take 1 to 2 s without the projection.

**"If clustering run id has only a couple of values per day, there is no reason to put it before the timestamp."**

The premise is about runs per day, but what matters is where a run's rows sit. A run's clustered rows are hash-sampled from the whole 30-day window, and every map read filters on one run.
- **With the run after time** (meeting layout), run reads cost 1.1 to 1.9 GiB. The bloom filter on the run id saved about 30% (round 1).
- **With the run before time:** 25 to 60 MiB.

**"Changing the key later realistically means a backfill."** (Also raised: "not easily for self-hosters without a major release.")

This is why the key is decided before Topics leaves closed beta. Both migrations drop and recreate the tables.

## Primary key, sampling and indexes

**"Stop the primary key after facet_id; a high-cardinality column in the PK has no point."**

Only primary key columns are in the sparse index. With the PK stopped at `facet_id`, `unit_hash < k` couldn't prune (24 GiB read for a 100k sample in round 1). The proposal ends the PK at `unit_hash`, which costs about 0.5 MiB of index memory.

**"Put facet_version before the hash, and drop trace_id / session_id if the hash is unique."**

Agreed. The 64-bit `cityHash64` makes the hash alone a safe dedup key. With 32 bits, collisions would be expected inside one (day, facet, version) group at our volumes.

**"Use the SAMPLE clause on a hash column, as `events_full` does."**

Tested:
- `SAMPLE` works on 25.12 and 26.4, but needs `SAMPLE BY` with the hash in the primary key.
- The explicit `unit_hash < k` reads less: 457 MiB vs 1.07 GiB, 25 ms vs 1.3 s (round 1).
- Both are deterministic per unit, so the sample is stable across nights. The proposal uses the explicit filter and has no `SAMPLE BY`.

**"A bloom filter on rule_id may be better than having it in the key."**

Measured on the meeting layout: the bloom filter skipped 2 of 2,208 granules for a 10% rule (1.56 GiB read). With `rule_id` in the key: 13 MiB. Rules interleave inside every granule, so the filter can't skip.

**"LowCardinality must stay under about 1,000 values across the whole table."**

Agreed. `facet_id` stays `String`, and `rule_ids` is `Array(String)`.

**"Bloom filter granularity should stay 1; tune the false-positive rate instead."**

Agreed. Granularity is 1 everywhere. Rates (0.001 vs 0.0001) were not compared yet.

**"Can we simply not dedupe?"** (Also raised: "LIMIT 1 BY is inherently expensive.")

Dedupe is still needed: facet versions coexist, and reprocessed or late rows exist. Its real cost was an unbounded middle level that scanned the project's whole history. Bounding it by the query window plus 2 days:
- List resolve: 2.7 GiB to 318 MiB.
- Nightly check: 3.3 GiB to 1.05 GiB.

With the day bucket, ReplacingMergeTree also merges same-day reprocessing on its own.

**"Is BFloat16 available on 25.12, any setting gotchas?"**

It works on 25.12.11 without any setting.

**"Could `topics` live in Postgres?"**

Not evaluated here, and `topics` is unchanged in both options. The review noted that a map has at most about 50 topics, so centroids can be passed into a ClickHouse query either way.

## Open

- **Product decision for the tracing table topic column.** Today it shows a topic only for traces with a row in the current run. On a large project, a page of 3-day-old traces shows no topic at all (0 of 100), because the refit re-clusters a 0.4% sample. "Latest placement in any run" fixes that; the proposal serves it from its lookup table.
- **Self-hosters** who set a cloud region or run a fork may have data in the current Topics tables. Both migrations drop them.
- **Prod calibration** on a read-only prod replica, and **bloom filter false-positive rates**.
