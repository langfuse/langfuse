# Method

How the numbers in [03-results.md](03-results.md) were produced, and how far they can be trusted.

## Data

One deterministic generator ([harness/gen_sum.sql](harness/gen_sum.sql), [harness/gen_asg.sql](harness/gen_asg.sql)) writes identical rows into every layout, so layouts differ only in their DDL.

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

Twenty read query shapes, Q07 to Q33 in [main-query-catalogue.md](main-query-catalogue.md). Each runs with the SQL that `main` builds today, with only the table names swapped. [02-queries.md](02-queries.md) lists the improvements and the per-layout rewrites. The generated SQL for every configuration is in [queries/](queries/).

Parameters follow the code: page batches of 200, 1,000-id lookups, 7/14/30-day refit steps, a 16k refit limit, and windows from the published map. Inputs such as candidate ids, scatter ids and trace pages are drawn from the data the same way the app gets them.

## Known gaps

- **Single local node.** Prod runs on shared storage with several replicas. Bytes read compare; latency does not. Before sign-off, replay the `main` queries on a read-only prod replica against real Topics data and compare bytes per row.
- **Writes** were measured as bulk inserts of 100k-row blocks. Prod writes through the batching ClickHouse writer, which creates more small parts before they merge.
- **Not evaluated:** bloom filter false-positive rates (0.001 vs 0.0001), vector search indexes, and the `topics` table.

## Re-running

```sh
# 1. tables in the scratch database topics_schema_exp (main layout, proposal, meeting)
clickhouse-client -n < harness/ddl_main_and_proposal.sql
clickhouse-client -n < harness/ddl_meeting.sql
# 2. summary text pool: any ~1,000 real summaries, e.g. from a local test project
clickhouse-client -q "INSERT INTO topics_schema_exp.pool SELECT summary FROM topic_facet_summaries WHERE project_id = '<local project>' AND summary != ''"
# 3. summaries, then the per-map counts the assignment generator uses, then assignments and the lookup copy
harness/seed_summaries.sh
clickhouse-client -q "INSERT INTO topics_schema_exp.map_counts SELECT project_id, facet_id, rule, count() / 30 FROM topics_schema_exp.sum_A ARRAY JOIN rule_ids AS rule WHERE processing_state = 'complete' GROUP BY ALL"
harness/seed_assignments.sh
clickhouse-client -q "INSERT INTO topics_schema_exp.asg_AB_by_time SELECT project_id, unit_start_time, facet_id, rule_id, trace_id, session_id, clustering_run_id, topic_id, topic_version_id, assigned_at, origin FROM topics_schema_exp.asg_AB"
# 4. all configurations for one project: bytes, rows, ms, memory and result rows per query
python3 harness/run_final.py cmlarge000000000000000001
python3 harness/run_final.py cmsmall000000000000000001
python3 harness/dump_queries.py   # regenerates queries/
```

All three summary layouts together need about 800 GB of disk. The local run dropped the main-layout summaries table after configurations 1 and 2 to make room for the meeting layout.
