# Results

Bytes read per query, from `system.query_log` ([5-method.md](5-method.md)). Bold marks the cheapest configuration. Result row counts match across configurations unless a cell says otherwise.

Configurations:
1. **main today**: today's tables and queries
2. **main + query fixes**: today's tables with the fixed queries ([2-versions/2-main-query-fixes.md](2-versions/2-main-query-fixes.md))
3. **review-call version**: the structure discussed in the 2026-11-18 review call, with the fixed queries
4. **proposal**: our alternative, compared against 3, with the fixed queries

Exact keys: [0-overview.md](0-overview.md#the-four-versions) and [1-migrations/](1-migrations/).

The raw benchmark output (TSV per run) is kept out of the PR; the tables below are taken from it. Configurations 1 and 2 ran before the main-layout summaries table was dropped for disk space, configurations 3 and 4 in the final harness run. Result row counts match across all four.

## Realistic insert cadence (final test)

The earlier rounds bulk-loaded neatly sorted parts. This test inserts the way prod does:
- **Cadence:** 14 days of traffic, each row inserted at its `processed_at` in 1-minute flushes mixed across projects (20k flushes, about 3k summaries and 3k assignments each).
- **Lag:** 90% of rows processed within 10 minutes of the trace start, 9% within 6 hours, 1% late up to 3 days. Plus reprocessed rows.
- **Refit:** a nightly refit per rule and facet on a stable 100k sample from the **last 7 days**, read the way the proposed refit reads and written in 1,000-row batches.
- **Merges:** time is compressed about 135x, so merges get less wall time than in prod. They still kept up. When queried, each summary table had about 116 parts, 7 to 9 of them small.
- **Write path:** every layout is fed by MVs from one ingest stream, and write time per MV comes from `system.query_views_log`.

Harness: [6-harness/cadence/](6-harness/cadence/).

**Summaries, 1M traces/day project, one facet**

| Query | minute (review call) | **hour (proposal)** | day |
|---|---|---|---|
| Refit, stable 100k sample, 7 days | 56.6 GiB | **3.4 GiB** | 0.9 GiB |
| Counts by state, 7 / 14 days | 2.6 / 5.3 GiB | **0.9 / 1.8 GiB** | 0.7 / 1.4 GiB |
| Newest 200, last day | 376 MiB | **125 MiB** | 97 MiB |
| Newest 200, last hour | 15 MiB | **5 MiB** | 7 MiB |
| Summaries in a 1-hour window | 35 MiB | **12 MiB** | 114 MiB |
| Scatter summaries, 1,000 ids, 7 days | 660 MiB | **232 MiB** | 93 MiB |
| List resolve, 200 traces from 10 minutes | 1.4 MiB | **1.9 MiB** | 2.9 MiB |
| Trace header, one trace, 93 days / delete lookup, 10 ids | 1.8 / 7.2 MiB | **3.3 / 10.2 MiB** | 2.4 / 6.5 MiB |
| Parts touched, 7-day counts | 66 | **63** | 64 |
| Write time for 14 days (per MV) | 497 s, +92 s pointer MV | **524 s** | 471 s |

**Assignments, same data**

| Query | review call `(project, facet, minute, run, hash)` | **proposal `(project, facet, run, topic, hour, hash)`** |
|---|---|---|
| Map counts, current run | 444 MiB | **115 MiB** |
| Topic page, newest 200 of a topic | 508 MiB | **11 MiB** |
| Tracing table topic filter, 7 days | 547 MiB | **12 MiB** |
| Scatter points | 383 MiB | **57 MiB** |
| Refit: previous run's traces | 317 MiB | **17 MiB** |
| Fit readback, 1,000 ids | 326 MiB | **57 MiB** |
| Topic growth, 7 runs | 803 MiB | 786 MiB |
| Trace header topics, one trace | **0.25 MiB** | 1.1 MiB |
| Tracing table topic column, newest / 3-day-old page | 5.5 / 17.8 MiB | **3.5 / 9.9 MiB** (lookup MV) |
| Parts touched | 14 to 20 | 13 to 18 |
| Write time for 14 days (per MV) | 131 s | 129 s, +112 s lookup MV |

The 10k traces/day project shows the same ranking at a fraction of the bytes. Result rows match across layouts. The one exception differs by under 0.1%: without `FINAL`, reprocessed rows collapse in different places per bucket.

**What it shows**

- **Part pruning doesn't depend on the bucket.** Every layout opens the same parts. ClickHouse picks parts by their min/max of `unit_start_time`, the partition column, not by the sort key. The bucket only decides how many granules are read inside those parts.
- **Minute:** cheap only for very short windows. It can't prune on facet or the sampling hash, so the refit is a full scan.
- **Day:** cheapest for windows of a week or more, but a 1-hour window reads the whole day of a facet.
- **Hour:** never far from the best of the other two. It gives up about 3.8x on the refit and about 1.3x on 7-day counts against the day bucket, and wins up to 9x on windows of an hour or less. That's why the proposal uses it: robust to access patterns we don't know yet, at a nightly batch cost of a few GiB.
- **Assignments:** run before time still wins 4x to 46x with a 7-day refit window (the 30-day gap was bigger, as expected). Writes are equal.
- **Bugs found and fixed in my own harness:** a refit query that deduplicated before sampling, a stdin leak in the ingest loop, and shifted assignment columns. Everything shown was re-run after the fixes.
- **Not covered:** one local node (Cloud's shared storage changes latency, not bytes), 14 days instead of 30, no project above 1M traces/day, simplified list and topic page queries (the earlier rounds ran `main`'s full SQL), and the refit's LLM naming calls.

## Bulk-load rounds (earlier)

Same queries on neatly bulk-loaded data, before the cadence test. The proposal below still used a day bucket for summaries.

## Large project: 1M traces/day, 30 days

| Query | 1 main today | 2 main + query fixes | 3 review-call version | 4 proposal |
|---|---|---|---|---|
| Q07 Topics page counts, summaries | 11.7 GiB | 11.7 GiB | 11.7 GiB | **2.9 GiB** |
| Q08 Topics page counts, assignments | 9.5 GiB | 9.5 GiB | 2.1 GiB | **2.1 GiB** |
| Q09 trace list candidates, newest 200 | 446 MiB | 344 MiB | 345 MiB | **94 MiB** |
| Q09 topic page candidates | 7.7 GiB | 7.7 GiB | 1.75 GiB | **9 MiB** |
| Q10 trace list resolve, 200 rows | 2.7 GiB | 318 MiB | **151 MiB** | 302 MiB |
| Q11 scatter plot summaries, 1,000 ids | 1.7 GiB | 1.7 GiB (original form) | 3.0 GiB | **718 MiB** |
| Q12 trace header time lookup | 821 MiB | 821 MiB | 33 MiB | **5 MiB** |
| Q13 nightly "new summaries?" | 3.3 GiB | 1.05 GiB | 2.0 GiB | **513 MiB** |
| Q15 refit today, newest 16k / 7 days | out of memory (22.8 GiB in 56 s) | 5.6 GiB, 20 s | 10.7 GiB, 16 s | **4.7 GiB, 18 s** |
| Q15' refit, stable 100k / 30 days | 258 GiB, 293 s | 258 GiB | 258 GiB, 282 s | **1.4 GiB, 3 s** |
| Q15' refit, stable 100k / 7 days | 61 GiB, 59 s | 61 GiB | 61 GiB, 70 s | **711 MiB, 0.8 s** |
| Q18 trace header topics | 893 KiB | 893 KiB | 1.8 MiB | **125 KiB** |
| Q19 tracing table topics, current run, newest 100 | **25 MiB** | 25 MiB | 34 MiB | 199 MiB |
| Q19L tracing table topics, latest placement, newest 100 | - | **25 MiB** (372 rows, no rule dimension) | 33 MiB | 28 MiB |
| Q19L same, 100 traces from 3 days earlier | - | 70 MiB (375 rows) | 77 MiB | **67 MiB** |
| Q20 tracing table topic filter, 7 days | 3.4 GiB | 3.4 GiB | 845 MiB | **52 MiB** |
| Q21 scatter plot points | 5.6 GiB | 5.6 GiB | 1.3 GiB | **35 MiB** |
| Q22 refit: previous run's traces | 5.6 GiB | 5.6 GiB | 1.2 GiB | **25 MiB** |
| Q23 fit readback, 1,000 ids | 4.3 GiB | 4.3 GiB | 1.1 GiB | **59 MiB** |
| Q33 delete lookup, summaries / assignments | 3.4 GiB / 40 MiB | same | 208 MiB / **38 MiB** | **48 MiB** / 57 MiB |

**Writes and disk (30 days, all projects)**

| | main today | review-call version | proposal |
|---|---|---|---|
| Summaries write time | **944 s** | 1,675 s (+77%, pointer MV) | 1,059 s (+12%) |
| Summaries disk | 254 GiB | 248 GiB + 5.7 GiB pointers | 255 GiB |
| Assignments write time | 257 s | **235 s** | 238 s, plus the lookup MV |
| Assignments disk | **8.1 GiB** | 13.0 GiB | 12.9 GiB + 6.4 GiB lookup |

## Small project: 10k traces/day, 30 days

Same ranking at about a hundredth of the bytes. The new layouts also read the small project's data more selectively, because the large project's rows no longer share its granules.

| Query | 1 main today | 2 main + query fixes | 3 review-call version | 4 proposal |
|---|---|---|---|---|
| Q07 / Q08 Topics page counts | 122 / 901 MiB | same | 122 / 208 MiB | **39 / 206 MiB** |
| Q09 topic page candidates | 724 MiB | 724 MiB | 163 MiB | **6 MiB** |
| Q10 trace list resolve | 51 MiB | 8 MiB | **4 MiB** | 9 MiB |
| Q11 scatter summaries | 289 MiB | 240 MiB | 239 MiB | **41 MiB** |
| Q13 nightly check | 55 MiB | 12 MiB | 21 MiB | **7 MiB** |
| Q15 refit today | 797 MiB | 257 MiB | 299 MiB | **97 MiB** |
| Q15' refit, stable 100k / 30 days | 2.75 GiB | 2.75 GiB | 2.77 GiB | **431 MiB** |
| Q19L tracing topics, latest placement, older page | - | 4.3 MiB | 13.5 MiB | **3.0 MiB** |
| Q20 tracing table topic filter | 99 MiB | 99 MiB | 34 MiB | **12 MiB** |
| Q21 / Q22 / Q23 run reads | 595 to 637 MiB | same | 146 to 148 MiB | **25 to 38 MiB** |
| Q33 delete lookup, summaries | 81 MiB | 81 MiB | 37 MiB | **3 MiB** |

## After the follow-up tests

The tables above were measured with `rule_id` in the proposal's assignments key and bloom filters at 0.001. The final proposal drops `rule_id` from the key and uses 0.0001. Both changes only lower its numbers:
- Assignment reads: equal or up to 2x less.
- Trace lookups: 3x to 5x less on the large project.

See [0-overview.md](0-overview.md#follow-up-tests).

## Reading it

- **Query fixes alone (2)** remove the refit's out-of-memory failure and cut list resolve and the nightly check 3x to 8x. Counts, topic pages, the tracing table filter, run reads and the stable refit sample stay at GiBs, because they need the hash, run or topic in the key.
- **The review-call version (3)** brings assignments to about 1 GiB for run reads, 4x better than main. A run's clustered rows still spread across the window. Its summaries keep the minute bucket, so counts and the refit read as on main. Today's refit reads about twice main's bytes, and the pointer MV costs 77% more summary write time.
- **The proposal (4)** is cheapest or close on every query. Its weak spot, the tracing table topic column, is covered by the lookup table: 28 MiB vs 199 MiB through the run-ordered table.
- **Refit window:** a stable 100k sample costs about the same per row over 7 or 30 days on the proposal (0.7 vs 1.4 GiB). Choosing 30 days for a steadier map costs little.
