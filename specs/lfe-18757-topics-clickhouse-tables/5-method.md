# Method

How the numbers in [3-results.md](3-results.md) were produced, and how far they can be trusted.

## Data

One deterministic generator ([6-harness/gen_sum.sql](6-harness/gen_sum.sql), [6-harness/gen_asg.sql](6-harness/gen_asg.sql)) writes identical rows into every layout, so layouts differ only in their DDL.

| | Value |
|---|---|
| Projects | L: 1M traces/day. S: 10k traces/day. N: 100k traces/day as background. 30 days (2026-10-04 to 2026-11-02), start times uniform within each day, ingestion interleaved day by day across projects. |
| Rules and facets | rule1: all traces, facets f1 to f4. rule2: 20% of traces, facets f4 (shared with rule1) and f5. |
| Summaries | One per trace and matching facet: about 4.2M/day for L, 140M rows in total. 88% `complete` with a 1024-dim BFloat16 embedding, 11% `not_applicable`, 1% `insufficient_input`. |
| Summary content | Text sampled from 1,066 real local summaries (average 105 characters). Synthetic embeddings compress like real ones (1.00x vs 1.02x, same spread). 32-hex trace ids. 10% of units are sessions (`trace_id = ''`), and a third of traces carry a session id. |
| Edge cases | f2 moves to facet version 2 on day 20, and 2% of older f2 traces are re-summarized. 0.3% of rows are reprocessed (same start, later `processed_at`). 0.2% are late arrivals (start shifted by 2 minutes). 1% are in an internal-eval environment. |
| Assignments | One online row per complete summary and matching rule, placed in the run of that day. Each night, every rule and facet refits on a stable hash sample of up to 100k summaries from the previous 30 days. 174M rows in total. |
| Outliers | Stored as rows with `topic_id = ''`: 15% of online rows and 25% of fit rows. 50 topics per map with skewed sizes. |

## Engine

- **Server:** local ClickHouse 26.4, MergeTree on local disk. The final DDL was also checked on 25.12.11, our lowest supported version.
- **Merges:** capped at 2 GB (`max_bytes_to_merge_at_max_space_in_pool`). That gives about 190 parts per wide table, close to what a large deployment reaches once wide parts stop merging around 150 GB.
- **Per query:** 8 threads, 6 GB of memory, and the query condition cache and uncompressed cache off. Queries that set their own settings in code keep them (the refit uses `max_threads = 2`, `max_execution_time = 60`).
- **Metric:** bytes and rows read from `system.query_log`. Timings are indicative only: one node, warm page cache, no shared storage.

## Queries

Twenty read query shapes (Q07 to Q33, listed with their source in [2-versions/1-main-today.md](2-versions/1-main-today.md)). Each runs with the SQL that `main` builds today, with only the table names swapped. The version pages in [2-versions/](2-versions/) show the fixes and per-version rewrites inline. `6-harness/dump_queries.py` writes the full SQL of every query per version to `6-harness/out/` for anyone who wants all of it.

Parameters follow the code: page batches of 200, 1,000-id lookups, 7/14/30-day refit steps, a 16k refit limit, and windows from the published map. Inputs such as candidate ids, scatter ids and trace pages are drawn from the data the same way the app gets them.

## Realistic insert cadence

The final test (see [3-results.md](3-results.md#realistic-insert-cadence-final-test)) replaces the bulk load:
- **Rows:** an arrivals index gives every summary a `processed_at` from a lag distribution: 90% within 10 minutes, 9% within 6 hours, 1% up to 3 days, plus reprocessed rows 1 to 2 hours later.
- **Flushes:** each minute of `processed_at` is one flush of summaries and their online assignments into Null ingest tables, fanned out by MVs to every layout. This is like one writer feeding several tables.
- **Refit:** at 02:00 a refit per (project, rule, facet) samples `unit_hash < k` from the hour or day table over the last 7 days (only rows processed by then), and writes 1,000-row batches.
- **Merges:** 14 days run in about 2.5 hours, so merges get roughly 135x less wall time than in prod.
- **Reads:** come from `system.query_log` (bytes, rows, `SelectedParts`, `SelectedMarks`). Write time per MV comes from `system.query_views_log`.

Scripts are in [6-harness/cadence/](6-harness/cadence/), run from the spec directory:
1. `arrivals.sql` and `arrivals_loop.sh`
2. `ddl.sql` and `view.sql`
3. `ingest.sh` (summaries and online assignments) and `ingest_asg.sh` (assignments only, with refits)
4. `suite.py <label>`

## Known gaps

- **Single local node.** Prod runs on shared storage with several replicas. Bytes read compare; latency does not. Before sign-off, replay the `main` queries on a read-only prod replica against real Topics data and compare bytes per row.
- **Writes** were measured as bulk inserts of 100k-row blocks. Prod writes through the batching ClickHouse writer, which creates more small parts before they merge.
- **Not evaluated:** vector search indexes and the `topics` table.

## Re-running

```sh
# 1. tables in the scratch database topics_schema_exp (main today, proposal, review-call version)
clickhouse-client -n < 6-harness/ddl_main_and_proposal.sql
clickhouse-client -n < 6-harness/ddl_review_call.sql
# 2. summary text pool: any ~1,000 real summaries, e.g. from a local test project
clickhouse-client -q "INSERT INTO topics_schema_exp.pool SELECT summary FROM topic_facet_summaries WHERE project_id = '<local project>' AND summary != ''"
# 3. summaries, then the per-map counts the assignment generator uses, then assignments and the lookup copy
6-harness/seed_summaries.sh
clickhouse-client -q "INSERT INTO topics_schema_exp.map_counts SELECT project_id, facet_id, rule, count() / 30 FROM topics_schema_exp.sum_A ARRAY JOIN rule_ids AS rule WHERE processing_state = 'complete' GROUP BY ALL"
6-harness/seed_assignments.sh
clickhouse-client -q "INSERT INTO topics_schema_exp.asg_AB_by_time SELECT project_id, unit_start_time, facet_id, rule_id, trace_id, session_id, clustering_run_id, topic_id, topic_version_id, assigned_at, origin FROM topics_schema_exp.asg_AB"
# 4. all four versions for one project: bytes, rows, ms, memory and result rows per query
python3 6-harness/run_final.py cmlarge000000000000000001
python3 6-harness/run_final.py cmsmall000000000000000001
python3 6-harness/dump_queries.py  # writes every query per version to 6-harness/out/ (not committed)
```

All three summary layouts together need about 800 GB of disk. The local run dropped the main-layout summaries table after versions 1 and 2 to make room for the review-call version.
