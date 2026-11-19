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
| **3. review-call version** | The structure discussed in the 2026-11-18 review call | [3-review-call-version.up.sql](1-migrations/3-review-call-version.up.sql) | [3-review-call-version.md](2-versions/3-review-call-version.md) |
| **4. proposal** | Our alternative, compared against 3: the pre-review draft, revised with the review's points that held up | [4-proposal.up.sql](1-migrations/4-proposal.up.sql) | [4-proposal.md](2-versions/4-proposal.md) |

Keys at a glance:

| | `topic_facet_summaries` | `topic_assignments` |
|---|---|---|
| 1, 2 | `(project_id, toStartOfMinute(t), facet_id, facet_version, trace_id, ...)` plus a projection | `(project_id, toStartOfMinute(t), facet_id, facet_version, trace_id, ...)` |
| 3 | PK `(project_id, toStartOfMinute(t), facet_id)`, ORDER BY adds `facet_version, unit_hash`; pointer MV (trace to time) | PK `(project_id, facet_id, toStartOfMinute(t))`, ORDER BY adds `run, unit_hash`; bloom on `rule_id` |
| 4 | `(project_id, toDate(t), facet_id, facet_version, unit_hash)` | `(project_id, facet_id, rule_id, run, topic_id, toStartOfHour(t), unit_hash)`; MV into a time-ordered trace-to-topic lookup |

Versions 3 and 4 share most review points: time first for summaries, a 64-bit hash of the trace or session id, no projections, rule ids not LowCardinality. They differ in three places:
- the summaries' time bucket (minute vs day)
- where the run sits in the assignments key (after vs before time)
- what the MV serves (summary pointers vs trace-to-topic lookup)

## Outcome

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

## Recommendation

Adopt version 4 together with the version 2 query fixes. Open before the implementation PR:
- What the tracing table topic column should show for older traces ([4-proposal.md](2-versions/4-proposal.md#tracing-table-topic-column)).
- How self-hosters with data in today's tables are handled.
- Bloom filter false-positive rates.
- A calibration run of `main`'s queries on a read-only prod replica.
