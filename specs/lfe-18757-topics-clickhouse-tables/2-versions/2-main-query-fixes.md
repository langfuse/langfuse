# Version 2: main + query fixes

Today's tables unchanged ([../1-migrations/1-main-today.sql](../1-migrations/1-main-today.sql)), with fixes to the queries `main` runs. It shows what we gain without a migration. Versions 3 and 4 use the same fixes.

## The fixes

**1. `embedding.size0` instead of `length(embedding)`** (Q13 nightly check, Q15 refit)

Standalone, `length(embedding)` reads only the array sizes. Inside the nested dedupe, it reads the full 2 KB arrays.

```sql
-- main
SELECT trace_id, unit_start_time, processed_at, processing_state, embedding_model, environment, length(embedding) AS dimensions FROM topic_facet_summaries ...
-- fixed
SELECT trace_id, unit_start_time, processed_at, processing_state, embedding_model, environment, embedding.size0 AS dimensions FROM topic_facet_summaries ...
```

Q15 goes from out of memory (22.8 GiB in 56 s) to 5.6 GiB in 20 s.

**2. Bound the "latest version" dedupe by time** (Q10, Q13, Q15; `latestSummaryFilterSql`, `packages/shared/src/server/topics/clickhouse.ts:47`)

Its middle level has no time condition, so it scans the project's whole history for the window's trace ids. A reprocessed summary keeps its trace's start time (late arrivals move it by minutes), so the same window, widened by 2 days, is enough.

```sql
SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
WHERE project_id = {projectId:String}
  AND unit_start_time >= {from:DateTime64(3)} - INTERVAL 2 DAY AND unit_start_time < {to:DateTime64(3)} + INTERVAL 2 DAY  -- added
  AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (...)
ORDER BY facet_version DESC, processed_at DESC
LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')
```

Q10 goes from 2.7 GiB to 318 MiB, and Q13 from 3.3 to 1.05 GiB.

**3. Newest first: read the last day first** (Q09 trace list candidates)

The candidate query sorts the whole map window to take the newest 200. Query the last day first, and widen only when a batch comes back short.

```sql
WHERE project_id = {projectId:String} AND unit_start_time >= {to:DateTime64(3)} - INTERVAL 1 DAY AND unit_start_time < {to:DateTime64(3)} ...
ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC, trace_id DESC, facet_id DESC LIMIT 200
```

446 MiB to 344 MiB on main, and 2.7 GiB to 94 MiB on the proposal.

**4. One dedupe level for the scatter plot** (Q11)

The scatter query pins the run's facet version, so the nested "latest version" filter repeats the outer `LIMIT 1 BY`.

```sql
SELECT project_id, facet_id, facet_version, trace_id, session_id, processing_state, summary, environment, unit_start_time, processed_at
FROM topic_facet_summaries
WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
  AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32} AND trace_id IN {traceIds:Array(String)}
ORDER BY processed_at DESC LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')
```

This helps versions 3 and 4 (version 4: 2.66 GiB to 718 MiB). On today's table, the nested form happens to read less (1.7 vs 4.3 GiB), so version 2 keeps it.

## What stays expensive

Counts, topic pages, the tracing table topic filter, run reads and a stable refit sample stay at GiBs. They need the hash, the run or the topic in the sort key, which only a migration can change (versions 3 and 4).

| Query (1M traces/day) | 1 main today | 2 main + query fixes |
|---|---|---|
| Q10 trace list resolve | 2.7 GiB | 318 MiB |
| Q13 nightly check | 3.3 GiB | 1.05 GiB |
| Q15 refit today | out of memory | 5.6 GiB |
| Q09 topic page candidates | 7.7 GiB | 7.7 GiB |
| Q20 tracing table topic filter | 3.4 GiB | 3.4 GiB |
| Q15' stable 100k refit sample, 30 days | 258 GiB | 258 GiB |
