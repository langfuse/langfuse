# Options

Four versions were compared: (1) main today, (2) main + query fixes, which uses the same tables as (1), (3) the review-call version and (4) the proposal. The pre-review draft below is where (4) started; it wasn't benchmarked separately. Full DDL: [migrations/](migrations/) (canonical migration templates) and [harness/](harness/) (the benchmark copies).

| | `topic_facet_summaries` key | `topic_assignments` key | Extra objects |
|---|---|---|---|
| **1 and 2: main today** | PK `(project_id, toStartOfMinute(t), facet_id, facet_version)`, ORDER BY adds `trace_id, session` | PK `(project_id, toStartOfMinute(t), facet_id, facet_version)`, ORDER BY adds `trace_id, session, run, origin` | projection `latest_source_versions`; bloom on `trace_id` (assignments) |
| pre-review draft (basis of 4) | `(project_id, facet_id, toDate(t), xxHash32 unit_hash, trace_id, session, facet_version)` | `(project_id, facet_id, rule_id, run, toStartOfHour(t), trace_id, ...)` | bloom on `trace_id` |
| **3. review-call version** ([migrations/review-call.up.sql](migrations/review-call.up.sql)) | PK `(project_id, toStartOfMinute(t), facet_id)`, ORDER BY adds `facet_version, unit_hash` | PK `(project_id, facet_id, toStartOfMinute(t))`, ORDER BY adds `run, unit_hash` | pointer MV `(project, facet, trace, session) -> unit_start_time`; blooms on `trace_id`, `session_id`, `rule_id` |
| **4. proposal** ([migrations/proposal.up.sql](migrations/proposal.up.sql)) | PK = ORDER BY `(project_id, toDate(t), facet_id, facet_version, unit_hash)` | PK `(project_id, facet_id, rule_id, run, topic_id, toStartOfHour(t))`, ORDER BY adds `unit_hash` | MV into `topic_assignments_by_trace` (time-ordered, narrow) for trace to topic lookups; blooms on `trace_id`, `session_id` |

Shared by the review-call version and the proposal:

- **No projections.** Lightweight deletes run in normal mode.
- **`unit_hash UInt64 MATERIALIZED cityHash64(if(trace_id = '', session_id, trace_id))`.** One expression covers traces and sessions. It has to be a stored column: as a key expression it isn't used for pruning. It's 64-bit, so it can end the dedup key without collisions.
- **`rule_ids Array(String)` on summaries and `rule_id String` on assignments.** Not LowCardinality, because rule ids are unbounded across projects.
- **No stored `unit_id`.** It would duplicate `trace_id` / `session_id` (about +15% disk). The bloom filters on both columns cover traces and sessions.
- **`BFloat16` embeddings** (works on 25.12 without a setting) and `origin` without the unused `backfill` value.

## How the proposal differs from the pre-review draft

| Change | Why |
|---|---|
| Summaries: time (day) before facet | The review asked for time first. With a day bucket it prunes as well as facet first (round 1: same refit cost), and trace lookups that don't know the facet stay cheap. |
| `cityHash64` (64-bit) instead of `xxHash32`, and no trace or session columns after the hash | With 32 bits, collisions inside the dedup key are expected at large volumes. With 64 bits the hash alone is a safe key (raised in review). |
| Primary key includes the hash | `unit_hash < k` (or `SAMPLE`) only prunes on primary key columns. |
| Assignments: `topic_id` after the run | Topic pages and the tracing table topic filter read one topic of one run: 15x less than without it. |
| Lookup table for trace to topic | Run-first order makes "latest topic of this trace" expensive (about 250 MiB per 100-trace page). The narrow time-ordered copy reads 25 MiB. |

## Why not the alternatives

- **2. main + query fixes:** the query fixes help (the refit no longer runs out of memory; list resolve and the nightly check cost 3x to 8x less). Counts, topic pages, the topic filter, run reads and a stable refit sample stay at GiBs, because they need the hash, the run or the topic in the key.
- **3. review-call version:** facet before time helps assignments 4x, but a run's clustered rows still span the whole window, so run reads stay around 1 GiB. Its summaries read like main's: the minute bucket keeps facet and hash from pruning, and the refit sample stays a full scan. The pointer MV costs 77% more summary write time.
- **Embeddings in a separate table** (tested in round 2): no read benefit, because columnar reads skip `embedding` anyway. Separate retention for embeddings can be a column TTL. Revisit only if a vector index needs its own table.
