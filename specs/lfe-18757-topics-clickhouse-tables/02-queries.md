# Queries: main today, improvements, per-layout rewrites

Every benchmarked query, the code on `main` that builds it, and what changes. The full SQL of every configuration is in [queries/](queries/): `main-main-queries/` is the SQL as `main` builds it today, `main-improved/` is the same schema with the fixes below, and `meeting-improved/` and `proposal-improved/` add the layout rewrites. File headers name the source function and line. [main-query-catalogue.md](main-query-catalogue.md) has all 36 Topics query shapes with every helper inlined (writes, setup and deletion included).

Paths are relative to the repo root, at `main` as of 2026-11-19.

| Id | Built by (main) | Use case | Improvement (all layouts) | Layout rewrite |
|---|---|---|---|---|
| Q07 | `getTopicResultCounts` summaries, `packages/shared/src/server/repositories/topic-results.ts:711` | Topics page counts | none | none |
| Q08 | `getTopicResultCounts` assignments, `topic-results.ts:730` | Topics page counts per topic | none | meeting, proposal: `AND rule_id IN (...)` (rule from the run in Postgres) |
| Q09 | `listCurrentRows` candidates, `topic-results.ts:314` | Trace list, topic page | Newest first: read the last day, widen only if a batch is short | proposal: rule filter on the topic page variant |
| Q10 | `listCurrentRows` resolve, `topic-results.ts:512` | Trace list, topic page | Bound the "latest version" dedupe by the window ±2 days | rule filter on the assignments CTE |
| Q11 | `getLatestFacetSummaries`, `packages/shared/src/server/topics/clickhouse.ts:371` | Scatter plot, trace header | Scatter: one `LIMIT 1 BY` level (the run pins the facet version). On main the original nested form reads less, so main keeps it. | none |
| Q12 | `getTopicTraceUnitTimeRange`, `clickhouse.ts:1316` | Trace header, public API trace lookup | none | meeting: read the pointer table |
| Q13 | `getTopicSummaryCounts`, `clickhouse.ts:765` | Nightly "new summaries?" check | `embedding.size0` instead of `length(embedding)`; bounded dedupe | none |
| Q15 | `getNewestTopicClusteringSummaries`, `clickhouse.ts:580` | Nightly refit, today: newest 16k in 7/14/30-day steps | `embedding.size0` (fixes out-of-memory at 1M traces/day); bounded dedupe | none |
| Q15' | new | Nightly refit: stable 100k hash sample over 30 or 7 days | `unit_hash < k` with `k = target / count * 2^64` | main, meeting: computed on the fly (no hash in the key) |
| Q18 | `readLatestTopicAssignments`, `clickhouse.ts:1182` | Trace header topics | none | rule filter |
| Q19 | `readCurrentTraceTopics`, `clickhouse.ts:1210` | Tracing table topic column (current run only) | none | rule filter |
| Q19L | new | Tracing table topic column, latest placement in any run | (new semantics, see below) | proposal: read `topic_assignments_by_trace` |
| Q20 | `currentTopicTraceIdsCondition`, `clickhouse.ts:1256` | Tracing table topic filter | none | rule filter |
| Q21 | `readTopicMapAssignments`, `clickhouse.ts:1123` | Scatter plot points | none | rule filter |
| Q22 | `readTopicRunTraceIds`, `clickhouse.ts:1085` | Refit: previous run's traces | none | rule filter |
| Q23 | `readTopicAssignments`, `clickhouse.ts:1149` | Fit write readback | none | rule filter |
| Q33 | trace delete bounds, `worker/src/features/traces/processClickhouseTraceDelete.ts:30` | Trace deletion (no time known) | none | meeting: read the pointer table |

## The improvements

**1. `embedding.size0` instead of `length(embedding)`** (Q13, Q15). Standalone, `length(embedding)` reads only the array sizes. Inside the nested dedupe it reads the full arrays. On a 1M traces/day project, today's refit (Q15) read 22.8 GiB in 56 s and then exceeded the memory limit, close to its own 60 s timeout. With `size0` it finishes in 20 s with 3.3 GiB of memory.

**2. Bounded "latest version" dedupe** (Q10, Q13, Q15). `latestSummaryFilterSql` (`packages/shared/src/server/topics/clickhouse.ts:47`, shared by Q10, Q11, Q13, Q14, Q15) has a middle level with no time condition, so it scans the project's whole history for the window's trace ids. A reprocessed summary keeps its trace's start time (late arrivals move it by minutes), so the middle level can use the same window, widened by 2 days. Q10 on main goes from 2.7 GiB to 318 MiB, and Q13 from 3.3 to 1.05 GiB.

**3. Newest first, last day first** (Q09). The candidate query sorts the whole window to take the newest 200. Reading the last day first and widening only when that's short cuts it to 94 MiB on the proposal (from 2.7 GiB) and 344 MiB on main.

**4. One dedupe level for the scatter plot** (Q11). The scatter query pins the run's facet version, so the nested "latest version" filter only repeats the outer `LIMIT 1 BY`. On the proposal: 718 MiB vs 2.66 GiB. On main the nested form happens to read less (1.7 vs 4.3 GiB), so main keeps it.

**5. Rule filter on assignment reads.** The run id already implies the rule, but the proposal's key starts with `facet_id, rule_id, run`. Passing the rule (available from the run row in Postgres) lets the key prune.

## Q19: what the tracing table topic column should show

`main` reads only the current run of each map. Online placements are written into the run that's current when a trace arrives, and each nightly refit creates a new run that re-clusters a sample. So after the next refit:

- **Large project (1M/day):** a page of 3-day-old traces showed no topic for any of 100 traces. The refit sample covers 0.4% of the window.
- **Small project (10k/day):** 166 of about 380 facet rows still had a topic, because its sample covers about 38%.

Q19L reads the trace's latest placement in any run of the map instead, which returns a topic for every placed trace (374 to 397 rows). This is a product decision, independent of the layout. Its cost per layout is in [03-results.md](03-results.md).
