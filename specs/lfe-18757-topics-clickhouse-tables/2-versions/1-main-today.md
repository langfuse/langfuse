# Version 1: main today

The Topics tables and queries as they run in production now. DDL: [../1-migrations/1-main-today.sql](../1-migrations/1-main-today.sql).

## Tables

| Table | Primary key | Sort key | Extras |
|---|---|---|---|
| `topic_facet_summaries` | `(project_id, toStartOfMinute(unit_start_time), facet_id, facet_version)` | adds `trace_id, if(trace_id = '', session_id, '')` | projection `latest_source_versions` (by trace) |
| `topic_assignments` | `(project_id, toStartOfMinute(unit_start_time), facet_id, facet_version)` | adds `trace_id, session, clustering_run_id, origin` | bloom filter on `trace_id` |

## Queries we replayed

The SQL as `main` builds it, with only table names swapped. Paths are relative to the repo root.

| Id | Built by | Use case |
|---|---|---|
| Q07 | `getTopicResultCounts`, `packages/shared/src/server/repositories/topic-results.ts:711` | Topics page counts (summaries) |
| Q08 | `getTopicResultCounts`, `topic-results.ts:730` | Topics page counts per topic (assignments) |
| Q09 | `listCurrentRows` candidates, `topic-results.ts:314` | Trace list, topic page |
| Q10 | `listCurrentRows` resolve, `topic-results.ts:512` | Trace list, topic page |
| Q11 | `getLatestFacetSummaries`, `packages/shared/src/server/topics/clickhouse.ts:371` | Scatter plot, trace header |
| Q12 | `getTopicTraceUnitTimeRange`, `clickhouse.ts:1316` | Trace header, public API trace lookup |
| Q13 | `getTopicSummaryCounts`, `clickhouse.ts:765` | Nightly "new summaries?" check |
| Q15 | `getNewestTopicClusteringSummaries`, `clickhouse.ts:580` | Nightly refit: newest 16k in 7/14/30-day steps |
| Q18 | `readLatestTopicAssignments`, `clickhouse.ts:1182` | Trace header topics |
| Q19 | `readCurrentTraceTopics`, `clickhouse.ts:1210` | Tracing table topic column |
| Q20 | `currentTopicTraceIdsCondition`, `clickhouse.ts:1256` | Tracing table topic filter |
| Q21 | `readTopicMapAssignments`, `clickhouse.ts:1123` | Scatter plot points |
| Q22 | `readTopicRunTraceIds`, `clickhouse.ts:1085` | Refit: previous run's traces |
| Q23 | `readTopicAssignments`, `clickhouse.ts:1149` | Fit write readback |
| Q33 | `deleteTopicResultsForTraces`, `worker/src/features/traces/processClickhouseTraceDelete.ts:30` | Trace deletion (no time known) |

Writes, rule setup queries on `events_core` and project deletion were not replayed: they don't depend on these sort keys.

## What we found (1M traces/day project)

- **The minute bucket blocks pruning on everything after it.** One minute of one facet holds fewer rows than a granule, so facet filters and hashes can't skip anything. Topics page counts read every facet (11.7 GiB). A stable refit sample is a full scan (258 GiB).
- **Today's refit (Q15) runs out of memory** at 1M traces/day: 22.8 GiB read in 56 s, then the 6 GB limit. Fixed by a one-token change in version 2.
- **Assignment reads by run cost 4 to 10 GiB** (topic page, topic filter, scatter, refit lookups), because the run sits after time and trace id in the key.
- **The tracing table topic column only shows topics from the current run.** On a large project, a page of 3-day-old traces shows no topic at all (0 of 100), because each nightly refit re-clusters a 0.4% sample. This is a product decision, independent of the layout ([4-proposal.md](4-proposal.md#tracing-table-topic-column)).

All numbers: [../3-results.md](../3-results.md).
