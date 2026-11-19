# Topics ClickHouse tables and sort keys (LFE-18757)

Evaluation for finalizing `topic_facet_summaries` and `topic_assignments` before Topics leaves closed beta and self-hosters get the tables. Changing a sort key later means a new table and a backfill, so the keys are decided now.

## Versions at a glance

The same names are used in every file, query folder and results table.

| Version | What it is | Tables | Queries |
|---|---|---|---|
| **1. main today** | What runs in production now | today's (`0051` + `0055`) | as `main` builds them |
| **2. main + query fixes** | Today's tables, better queries. Shows what we gain without a migration. | today's | fixed ([02-queries.md](02-queries.md)) |
| **3. review-call version** | The structure discussed in the 2026-11-18 review call: time first with a minute bucket, hash instead of trace id, a pointer MV instead of the projection, facet before time for assignments, `rule_id` as a bloom filter | [migrations/review-call.up.sql](migrations/review-call.up.sql) | fixed |
| **4. proposal** | Our alternative, compared against 3. It started from the pre-review draft and keeps the review's points where they held up: time first for summaries, but a day bucket; run and topic before time for assignments; a lookup MV for trace to topic | [migrations/proposal.up.sql](migrations/proposal.up.sql) | fixed |

Versions 3 and 4 differ in three places, each tested in [04-review-feedback.md](04-review-feedback.md):
- **Summaries' time bucket:** minute vs day.
- **Where the run sits in the assignments key:** after vs before time.
- **What the MV serves:** summary pointers vs trace-to-topic lookup.

## Recommendation

Adopt the **proposal** ([migrations/proposal.up.sql](migrations/proposal.up.sql)) together with the query fixes in [02-queries.md](02-queries.md).

- **`topic_facet_summaries`:** `(project_id, toDate(unit_start_time), facet_id, facet_version, unit_hash)` as both primary key and sort key. `unit_hash` is a stored 64-bit hash of the trace or session id. No projection.
- **`topic_assignments`:** `(project_id, facet_id, rule_id, clustering_run_id, topic_id, toStartOfHour(unit_start_time), unit_hash)`, plus a materialized view into a narrow time-ordered `topic_assignments_by_trace` for trace to topic lookups.
- **Query fixes:**
  - `embedding.size0` instead of `length(embedding)`: today's refit runs out of memory at 1M traces/day without it.
  - A time-bounded "latest version" dedupe.
  - Newest-first lists read the last day first.
  - A single dedupe level for the scatter plot.
  - A rule filter on assignment reads.
  - The nightly refit samples `unit_hash < k` over 7 or 30 days instead of taking the newest 16k.

On a 1M traces/day project this reads 5x to 1,000x less than main for counts, topic pages, the tracing table topic filter, run reads and the refit. A stable 100k refit sample over 30 days drops from 258 GiB to 1.4 GiB. Summary writes are 12% slower.

## Contents

| File | What it covers |
|---|---|
| [01-method.md](01-method.md) | Test data, engine settings, known gaps, how to re-run |
| [02-queries.md](02-queries.md) | Every benchmarked query: the code on main that builds it, the improvement, the per-layout rewrite |
| [03-results.md](03-results.md) | Bytes read for the four versions on a 1M/day and a 10k/day project; writes and disk |
| [04-review-feedback.md](04-review-feedback.md) | Each point raised in review, with what we measured |
| [05-options.md](05-options.md) | The exact keys of each version and how they differ |
| [migrations/](migrations/) | `review-call.up.sql` (version 3), `proposal.up.sql` (version 4) and a shared `down.sql` in canonical template syntax (checked on 25.12 and 26.4, unclustered) |
| [queries/](queries/) | Generated SQL for each version, one file per query, with the source function on main |
| [harness/](harness/) | DDL, data generators, seed scripts and the replay runner |
| [results/](results/) | Raw benchmark output |

## Not in this PR

The app code still writes and reads the current tables. The migrations live here rather than in `packages/shared/clickhouse/migrations/canonical/`. Applying one means changing the writers (new `rule_ids`, `rule_id`), the readers ([02-queries.md](02-queries.md)) and the refit sampling in the same PR, after we agree on the layout.

Open before that PR:
- The product semantics of the tracing table topic column ([02-queries.md](02-queries.md#q19-what-the-tracing-table-topic-column-should-show)).
- How self-hosters with data in the current tables are handled.
- Bloom filter false-positive rates.
- A calibration run of main's queries on a read-only prod replica.
