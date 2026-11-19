# Version 3: review-call version

The structure discussed in the 2026-11-18 review call, written down as we understood it. DDL: [../1-migrations/3-review-call-version.up.sql](../1-migrations/3-review-call-version.up.sql). Queries use the version 2 fixes.

## What the call agreed

- **Summaries:**
  - Keep time early in the key.
  - Facet ahead of the hash. Facet version ahead of the hash, since it is low cardinality.
  - Replace the trace or session id with a hash of it.
  - Stop the primary key after `facet_id`.
- **Pointer views:** materialized views that store only pointers, (project, facet, trace) to timestamp, for lookups by facet or trace and for finding the stable refit sample. Partition them by month; readers supply a month.
- **No projections:** data retention with `ALTER UPDATE` would break on them.
- **Assignments:**
  - Facet before time (single-digit facets per project).
  - Run and rule after time; the primary key stops at time.
  - `rule_id` as a bloom filter rather than a key column.
  - The hash instead of the trace id.
- **Indexes and types:**
  - Bloom filter granularity 1; tune the false-positive rate instead.
  - LowCardinality only for columns with under about 1,000 values across the table, so not `facet_id` or rule ids.
- **To check:** the `SAMPLE` clause for the stable sample, and how `xxHash32` handles the trace/session condition.

## Tables as written

| Table | Primary key | Sort key | Extras |
|---|---|---|---|
| `topic_facet_summaries` | `(project_id, toStartOfMinute(unit_start_time), facet_id)` | adds `facet_version, unit_hash` | blooms on `trace_id`, `session_id`; no projection |
| `topic_facet_summary_pointers` | | `(project_id, facet_id, trace_id, session_id, facet_version, unit_start_time)`, monthly partitions | fed by `topic_facet_summary_pointers_mv` |
| `topic_assignments` | `(project_id, facet_id, toStartOfMinute(unit_start_time))` | adds `clustering_run_id, unit_hash` | blooms on `trace_id`, `session_id`, `rule_id` |

`unit_hash` is `UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id))`. With 64 bits it can end the key without collisions; with `xxHash32` it couldn't.

## Query rewrites on top of version 2

- **Assignment reads add `AND rule_id IN (...)`.** The rule is known from the run row in Postgres.
- **Trace time and delete lookups (Q12, Q33) read the pointer table:**
  ```sql
  SELECT count(), min(unit_start_time), max(unit_start_time) FROM topic_facet_summary_pointers
  WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
    AND trace_id IN {traceIds:Array(String)}
  ```
- **The stable refit sample (Q15')** filters `cityHash64(...) < k`. The hash isn't in the primary key, so it can't prune.

## How it did (1M traces/day)

| Query | 1 main today | 3 review-call version | 4 proposal |
|---|---|---|---|
| Q07 / Q08 Topics page counts | 11.7 / 9.5 GiB | 11.7 / 2.1 GiB | 2.9 / 2.1 GiB |
| Q09 topic page candidates | 7.7 GiB | 1.75 GiB | 9 MiB |
| Q20 tracing table topic filter | 3.4 GiB | 845 MiB | 52 MiB |
| Q21 / Q22 scatter points / previous run | 5.6 / 5.6 GiB | 1.3 / 1.2 GiB | 35 / 25 MiB |
| Q12 trace header time lookup | 821 MiB | 33 MiB (pointer) | 5 MiB |
| Q15 refit today | out of memory | 10.7 GiB | 4.7 GiB |
| Q15' stable 100k refit sample, 30 days | 258 GiB | 258 GiB | 1.4 GiB |
| Summary write time, 30 days | 944 s | 1,675 s | 1,059 s |

- **What works:** facet before time makes assignments 4x cheaper than today. The pointer view makes trace lookups cheap, and dropping the projection makes deletes simple.
- **What falls short:**
  - **The minute bucket** keeps facet and hash from pruning: one minute of one facet holds fewer rows than a granule. So summary counts read as today, and the stable refit sample stays a full scan.
  - **The pointer view finds the sample in 14 MiB,** but fetching its embeddings still touches nearly every granule (65.8 GiB).
  - **A run's clustered rows are sampled from the whole window,** so with the run after time, every run read covers the window (about 1 GiB). The `rule_id` bloom filter skipped 2 of 2,208 granules.
  - **The pointer view adds 77% to summary write time.**

Each point is answered in detail in [../4-review-feedback.md](../4-review-feedback.md).
