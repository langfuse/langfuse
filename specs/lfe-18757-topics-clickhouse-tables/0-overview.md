# Topics ClickHouse tables and sort keys

`topic_facet_summaries` and `topic_assignments` need their final sort keys before Topics leaves closed beta and self-hosters get the tables. Changing a sort key later means a new table and a backfill. This directory compares four versions on the same data and the same queries, so we can decide now.

Read top to bottom. Each step goes one level deeper:

1. **This page:** the versions, the outcome, the recommendation.
2. **[1-migrations/](1-migrations/):** what the tables of each version look like.
3. **[2-versions/](2-versions/):** one page per version, covering where it comes from, what changes in the queries (SQL inline), and its numbers.
4. **[3-results.md](3-results.md):** every number in one place, for a 1M and a 10k traces/day project.
5. **[4-review-feedback.md](4-review-feedback.md):** each point from the review call, with what we measured.
6. **[5-method.md](5-method.md):** test data, engine settings, what isn't realistic, how to re-run ([6-harness/](6-harness/)).

## The four versions

| Version | What it is | Tables | Page |
|---|---|---|---|
| **1. main today** | What runs in production now | [1-main-today.sql](1-migrations/1-main-today.sql) | [1-main-today.md](2-versions/1-main-today.md) |
| **2. main + query fixes** | Today's tables with fixed queries: what we gain without a migration | same as 1 | [2-main-query-fixes.md](2-versions/2-main-query-fixes.md) |
| **3. review-call version** | The layout from the 2026-11-18 review call, written down as we understood it (exact keys below; what we filled in ourselves is listed on its page) | [3-review-call-version.up.sql](1-migrations/3-review-call-version.up.sql) | [3-review-call-version.md](2-versions/3-review-call-version.md) |
| **4. proposal** | Our alternative, compared against 3: the pre-review draft, revised with the review's points that held up | [4-proposal.up.sql](1-migrations/4-proposal.up.sql) | [4-proposal.md](2-versions/4-proposal.md) |

Keys at a glance:

| | `topic_facet_summaries` | `topic_assignments` |
|---|---|---|
| 1, 2 | `(project_id, toStartOfMinute(t), facet_id, facet_version, trace_id, ...)` plus a projection | `(project_id, toStartOfMinute(t), facet_id, facet_version, trace_id, ...)` |
| 3 | PK `(project_id, toStartOfMinute(t), facet_id)`, ORDER BY adds `facet_version, unit_hash`; pointer MV (trace to time) | PK `(project_id, facet_id, toStartOfMinute(t))`, ORDER BY adds `run, unit_hash`; bloom on `rule_id` |
| 4 | `(project_id, toStartOfHour(t), facet_id, facet_version, unit_hash)` | `(project_id, facet_id, run, topic_id, toStartOfHour(t), unit_hash)`; MV into a time-ordered trace-to-topic lookup |

Versions 3 and 4 share most review points: time first for summaries, a 64-bit hash of the trace or session id, no projections, rule ids not LowCardinality. They differ in three places:
- the summaries' time bucket (minute vs hour)
- where the run sits in the assignments key (after vs before time)
- what the MV serves (summary pointers vs trace-to-topic lookup)

## Outcome under realistic inserts

The final test inserts 14 days of traffic the way prod does: 1-minute flushes, processing lag, late arrivals, nightly refits on a 7-day sample. Full numbers are in [3-results.md](3-results.md#realistic-insert-cadence-final-test).

| Query (1M traces/day project) | review-call version | proposal |
|---|---|---|
| Refit, stable 100k sample, 7 days | 56.6 GiB | 3.4 GiB |
| Counts by state, 7 days | 2.6 GiB | 0.9 GiB |
| Summaries in a 1-hour window | 35 MiB | 12 MiB |
| Topic page / tracing table topic filter | 508 / 547 MiB | 11 / 12 MiB |
| Map counts, current run | 444 MiB | 115 MiB |
| Parts touched (7-day counts) | 66 | 63 |

- **Both layouts open the same parts.** A coarser time bucket doesn't cost part pruning, because parts are picked by their min/max of `unit_start_time`.
- **The proposal moved from a day to an hour bucket after this test.** Day reads a little less on week-long windows, hour much less on windows of an hour or less.

## Outcome (bulk-loaded rounds)

Bytes read on a 1M traces/day project over 30 days (140M summaries, 174M assignments). The 10k/day project ranks the same at about a hundredth of the bytes.

| Query | 1 main today | 2 main + query fixes | 3 review-call version | 4 proposal |
|---|---|---|---|---|
| Topics page counts (summaries / assignments) | 11.7 / 9.5 GiB | same | 11.7 / 2.1 GiB | **2.9 / 2.1 GiB** |
| Topic page candidates | 7.7 GiB | 7.7 GiB | 1.75 GiB | **9 MiB** |
| Trace list resolve | 2.7 GiB | 318 MiB | **151 MiB** | 302 MiB |
| Tracing table topic filter | 3.4 GiB | 3.4 GiB | 845 MiB | **52 MiB** |
| Scatter plot (summaries / points) | 1.7 / 5.6 GiB | same | 3.0 / 1.3 GiB | **718 / 35 MiB** |
| Nightly refit as today (newest 16k) | out of memory | 5.6 GiB | 10.7 GiB | **4.7 GiB** |
| Nightly refit, stable 100k sample, 30 days | 258 GiB | 258 GiB | 258 GiB | **1.4 GiB** |
| Summary write time, 30 days | **944 s** | 944 s | 1,675 s | 1,059 s |

- **Query fixes alone (2)** remove today's refit failure and cut list resolve and the nightly check 3x to 8x. Everything that needs the hash, run or topic in the key stays at GiBs.
- **The review-call version (3)** makes assignments 4x cheaper. Its minute bucket keeps summaries as expensive as today, and the stable refit sample stays a full scan. Run reads stay around 1 GiB, and the pointer MV adds 77% write time.
- **The proposal (4)** is cheapest or close on every measured query. It costs 12% more summary write time and more assignment disk.

## Follow-up tests

Three open points from the call, tested afterwards. Details are on the version pages.

| Test | Result | Applied |
|---|---|---|
| A sample-copy MV for the review-call layout: a 1/16 hash slice of summaries with embeddings, ordered by (project, day, facet, hash) | The large project's 30-day refit reads 919 MiB (proposal: 1.44 GiB), for +6% disk and writes. Projects under about 50k traces/day need more than the slice holds, and fall back to scanning every facet (2.65 GiB at 10k/day, proposal 303 MiB). | Documented on [3-review-call-version.md](2-versions/3-review-call-version.md#follow-up-a-sample-copy-mv) |
| `rule_id` in the proposal's assignments key | Same or fewer bytes without it: the run already implies the rule | Removed from the key |
| Bloom filter false-positive rate, 0.001 vs 0.0001 | 0.0001 reads 3x to 5x less on trace lookups (delete lookup 8 vs 44 MiB, tracing table page 13 vs 66 MiB) for about 27% more index (+60 MiB on 255 GiB) | 0.0001 in both migrations |

## Recommendation

Adopt version 4 together with the version 2 query fixes. Open before the implementation PR:
- What the tracing table topic column should show for older traces ([4-proposal.md](2-versions/4-proposal.md#tracing-table-topic-column)).
- How self-hosters with data in today's tables are handled.
- A calibration run of `main`'s queries on a read-only prod replica.
