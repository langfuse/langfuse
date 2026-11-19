# Topics ClickHouse query catalogue (`main`)

Source: `git show main:<path>` read on 2026-11-19. Static trace only: no query was run, so row counts and sizes are estimates from code constants.

Line numbers point at `main`. Every SQL block is the text the code builds, with every helper inlined (`unitTimeFilterSql`, `sourceKeySql`, `summarySourceKeySql`, `latestSummaryFilterSql`, `clusteringSummaryScopeSql`, `clusteringSummariesSql`, `cohortFilterSql`, `cohortSampleSql`, `currentResultsSql`, `resolveRowsSql`, `currentTraceAssignmentsSql`, `topicSetupTracesSql`, `summarizedTraceIdsSql`, and the events query builder output). `{name:Type}` placeholders are as sent. `queryClickhouse` and `queryClickhouseStream` add `FORMAT JSONEachRow` and a `log_comment` built from `tags` (the `route` tag is listed per query, so you can match `system.query_log`).

Constants used below:

| Constant | Value | Where |
|---|---|---|
| `INTERNAL_EVAL_ENVIRONMENT_PREFIX` (`{internalEnvironmentPrefix}`) | `'langfuse'` | `packages/shared/src/server/llm/isInternalEvalEnvironment.ts:1` |
| `PUBLIC_LLM_JUDGE_ENVIRONMENT` (`{publicLlmJudgeEnvironment}`) | `'llm-as-a-judge'` | same file, :5 |
| `OBSERVATIONS_TO_TRACE_INTERVAL_DAYS` / `TRACE_START_SLACK_MS` | 2 days | `packages/shared/src/server/repositories/constants.ts:4` |
| `TOPICS_MAX_TIME_RANGE_MS` | 93 days | `packages/shared/src/topics/index.ts:30` |
| `TOPICS_MAX_SELECTION_RANGE_MS` | 30 days | `packages/shared/src/topics/index.ts:32` |
| `TOPICS_SLICE_MAX_TRACES` (`{cohortLimit}`) | 20,000 | `packages/shared/src/topics/index.ts:132` |
| `LOOKUP_BATCH_SIZE` | 1,000 ids per query | `packages/shared/src/server/topics/clickhouse.ts:76` |
| `INSERT_BATCH_SIZE` / `INSERT_BATCH_BYTES` | 10,000 rows / 8 MiB | `clickhouse.ts:77-78` |
| `MAX_CLUSTERING_ROWS` / `MAX_CLUSTERING_BYTES` | 20,000 / 256 MiB | `worker/src/features/topics/processTopicsExecution.ts:92-93` |
| Refit limits (`refitLimits`) | maxRows 16,000, maxBytes 214,748,364 (80 %) | `processTopicsExecution.ts:909-915` |
| `TOPIC_RULE_SETUP_TICK_MS` | 15 s (rule and snapshot setup ticks) | `worker/src/features/topics/ruleSetup.ts:40`, `worker/src/queues/topicsSetupQueue.ts:22` |
| Rule setup `SETUP_TRACES` / `ENOUGH_SUMMARIES` | 500 / 400 | `ruleSetup.ts:42-43` |
| `TOPIC_SETUP_WINDOW_DAYS` | 7, 14, 30 | `packages/shared/src/server/repositories/topic-setup-events.ts:13` |
| Web `TOPIC_SETUP_BACKFILL_LIMIT` | 500 | `web/src/features/topics/topic-setup-flow.ts:20` |
| `TOPICS_SNAPSHOT_SUMMARIZE_MAX_TRACES` | 1,000 | `packages/shared/src/topics/index.ts:155` |
| Public API result limit | 1..100, default 50 | `web/src/features/public-api/types/unstable-topics.ts:6,167` |
| Public API result window | max 30 days, default 7 days | `web/src/features/topics/server/publicApi.ts:39,407` |

`READ_OPTIONS` (`packages/shared/src/server/repositories/topic-results.ts:292-299`), used by Q07-Q10: `preferredClickhouseService: "ReadOnly"`, `request_timeout: 10000` ms, settings `read_in_order_use_buffering = 0`, `cancel_http_readonly_queries_on_client_close = 1`.

When a query passes no `preferredClickhouseService`, it goes to the client's default service.

Table keys that matter when replaying (from `packages/shared/clickhouse/migrations/canonical/0051_add_topics.up.sql`, `0055_update_topic_tables.up.sql`):

- `topics`: ReplacingMergeTree(created_at), `PARTITION BY toYYYYMM(created_at)`, `ORDER BY (project_id, toDate(created_at), id)`.
- `topic_facet_summaries`: ReplacingMergeTree(processed_at), `PARTITION BY toYYYYMM(unit_start_time)`, `PRIMARY KEY (project_id, toStartOfMinute(unit_start_time), facet_id, facet_version)`, `ORDER BY (... , trace_id, if(trace_id = '', session_id, ''))`, projection `latest_source_versions` (`project_id, facet_id, facet_version, trace_id, session_id, unit_start_time, processed_at` ordered by `(project_id, facet_id, trace_id, if(trace_id = '', session_id, ''), facet_version)`). `embedding` is `Array(BFloat16)`.
- `topic_assignments`: ReplacingMergeTree(assigned_at), same partition and primary key as summaries, `ORDER BY (..., trace_id, if(trace_id = '', session_id, ''), clustering_run_id, origin)`, `bloom_filter(0.001)` index `idx_trace_id` on `trace_id`.
- Inserts into `topic_facet_summaries` also fire the `billable_events_topic_facet_summaries_mv` materialized view into `billable_events` (`packages/shared/clickhouse/scripts/dev-tables.sh:211-235`; it is in the dev script, its prod migration was not checked).

## Summary

| Id | Function (file:line) | Use case | Tables | Frequency |
|---|---|---|---|---|
| Q01 | `getTopicDefinitions` (topics/clickhouse.ts:139) | Hydrating any run: Topics page, topic page, trace header, map, worker fits, public API | topics | Every `getTopicRun(s)`/`getPublishedTopicRun`/`getTopicRuleMap` with topics; batches of 1,000 ids |
| Q02 | `getTopicNames` (topics/clickhouse.ts:191) | Tracing table topic column, filter options, topic filter | topics | Every tracing request that touches topics |
| Q03 | `writeTopicDefinitions` (topics/clickhouse.ts:265) | Writes: new topic definitions when a run is saved | topics | Once per completed fit |
| Q04 | `hasStoredTopicSummaries` (topics/clickhouse.ts:684) | Topics page counts, trace header readiness | topic_facet_summaries | Page loads; Redis cache 30 min (ready) / 30 s (empty) |
| Q05 | `hasTopicEmbeddings` (topics/clickhouse.ts:672) | Model settings save | topic_facet_summaries | Only when the embedding model changes |
| Q06 | `getTopicExecutionCosts` (topics/clickhouse.ts:733) | Run history list and run detail | topic_facet_summaries | Per load of executions / execution |
| Q07 | `getTopicResultCounts` summaries (topic-results.ts:711) | Topics page counts, public API/MCP topics list | topic_facet_summaries | Per Topics page load, per facet window group |
| Q08 | `getTopicResultCounts` assignments (topic-results.ts:730) | Same as Q07, in parallel | topic_assignments | Same as Q07 |
| Q09 | `listCurrentRows` candidates (topic-results.ts:314, 459) | Topics page trace list / topic page, public API/MCP summaries and assignments | topic_facet_summaries or topic_assignments | Per page, up to 10 batches |
| Q10 | `listCurrentRows` resolve (topic-results.ts:512) | Same as Q09 | topic_facet_summaries + topic_assignments | One per candidate batch |
| Q11 | `getLatestFacetSummaries` (topics/clickhouse.ts:371) | Scatter plot, trace header | topic_facet_summaries | Per map load (batches of 1,000 ids); per trace view per facet |
| Q12 | `getTopicTraceUnitTimeRange` (topics/clickhouse.ts:1316) | Trace header, public API trace lookup | topic_facet_summaries | Per trace view; per public API traceId list request |
| Q13 | `getTopicSummaryCounts` (topics/clickhouse.ts:765) | Snapshot preview, snapshot fit precheck, nightly refit check | topic_facet_summaries (+ events_core via cohort) | Per preview; per snapshot fit; nightly per rule and facet |
| Q14 | `getTopicClusteringSummaries` (topics/clickhouse.ts:498) | Snapshot (analysis) fit | topic_facet_summaries (+ events_core) | Once per snapshot facet |
| Q15 | `getNewestTopicClusteringSummaries` (topics/clickhouse.ts:580) | Nightly refit, rule setup fit, manual refresh | topic_facet_summaries (+ events_core) | Per refit per facet, 1-3 steps (7/14/30 d) |
| Q16 | `getTopicSetupSummaryCounts` (topics/clickhouse.ts:838) | Rule setup selection | topic_facet_summaries (+ events_core) | Rule setup, 1-3 windows (7/14/30 d) |
| Q17 | `countTopicTraceSummaries` (topics/clickhouse.ts:880) | Rule setup and snapshot setup progress | topic_facet_summaries | Every 15 s tick while summarizing |
| Q18 | `readLatestTopicAssignments` (topics/clickhouse.ts:1182) | Trace header | topic_assignments | Per trace view per facet |
| Q19 | `readCurrentTraceTopics` (topics/clickhouse.ts:1210) | Tracing table topic column | topic_assignments | Per tracing table page (up to 500 traces) |
| Q20 | `currentTopicTraceIdsCondition` (topics/clickhouse.ts:1256) | Tracing table topic filter (inside events query) | topic_assignments (+ events_core) | Per tracing table request with a topic filter (rows + count) |
| Q21 | `readTopicMapAssignments` (topics/clickhouse.ts:1123) | Scatter plot; worker resume of a completed run | topic_assignments | Per map load |
| Q22 | `readTopicRunTraceIds` (topics/clickhouse.ts:1085) | Fit continuity with previous map | topic_assignments | Once per fit that has a previous map |
| Q23 | `readTopicAssignments` (topics/clickhouse.ts:1149) | Fit: write readback, previous memberships | topic_assignments | Per 1,000 summaries in a fit, twice |
| Q24 | ClickhouseWriter `topic_facet_summaries` (processTopicsTrace.ts:176) | Writes: summaries | topic_facet_summaries | Per summarized trace and facet |
| Q25 | `writeTopicAssignments` (topics/clickhouse.ts:945) | Writes: initial assignments of a fit | topic_assignments | Per 1,000 summaries in a fit |
| Q26 | ClickhouseWriter `topic_assignments` (processTopicsTrace.ts:223) | Writes: online assignments | topic_assignments | Per complete summary per matching rule with a map |
| Q27 | `countTopicCohortTraces` (trace-selection.ts:180) | Snapshot preview | events_core | Per preview and per snapshot start |
| Q28 | `selectTopicTraceRows` (trace-selection.ts:199) | Setup dialog trace preview | events_core | Per preview |
| Q29 | `getTopicSetupTraceCount` (topic-setup-events.ts:81) | Setup dialog counts, snapshot unsummarized estimate | events_core (+ topic_facet_summaries) | Per dialog load: 7 d, then 30 d unless 7 d is enough |
| Q30 | `getTopicSetupTraceIds` (topic-setup-events.ts:112) | Rule setup and snapshot seeding | events_core (+ topic_facet_summaries) | Rule setup: 1-3 windows; snapshot: once |
| Q31 | `getTopicSetupTraceBounds` (topic-setup-events.ts:153) | Rule setup and snapshot seeding | events_core | Once per seeding |
| Q32 | `getTopicSetupTraceNames` (topic-setup-events.ts:202) | Setup dialog trace-name picker | events_core | Per dialog load |
| Q33 | trace delete bounds (processClickhouseTraceDelete.ts:30) | Deletion of traces | topic_facet_summaries, topic_assignments | Per trace-delete job, once per table |
| Q34 | trace delete DELETE (processClickhouseTraceDelete.ts:46) | Deletion of traces | topic_facet_summaries, topic_assignments | Per trace-delete job, once per table with rows |
| Q35 | project cleaner count (batch-project-cleaner/index.ts:289) | Deletion of projects | topic_facet_summaries, topic_assignments, topics | Periodic (10 min / 1 h) per table |
| Q36 | project cleaner DELETE (batch-project-cleaner/index.ts:319) | Deletion of projects | same | Periodic per table when counts > 0 |

Two shared subqueries are not run on their own and are listed as fragments: F1 (matching observations of a rule filter) and F2 (F1 restricted to summarized traces). Appendix A lists adjacent event reads that feed Topics but do not touch the Topics tables or the events_core selection paths.

No data retention job touches the Topics tables on `main` (`worker/src/features/batch-data-retention-cleaner`, `worker/src/ee/dataRetention` have no Topics references).

---

## Fragments (inlined into queries below)

### F1: matching observations of a rule filter

`matchingObservationsQuery` (`packages/shared/src/server/topics/trace-selection.ts:43-111`), exposed as `topicMatchingTraceIdsQuery` (:159) and `selectTopicCohortTraces` (:173). It wraps the events row-selection planner (`buildEventsObservationRowSelection`, `packages/shared/src/server/queries/clickhouse-sql/events-observation-row-selection.ts:411-520`) and `EventsQueryBuilder.buildQuery` (`event-query-builder.ts:628-680`). Comment filters resolve in Postgres first; when they exclude everything the function returns null (callers then skip the query or use `SELECT '' AS id LIMIT 0`).

Shape with a time window, a `traceName` filter and one other events filter (here `environment any of`). The predicate compiler gives its placeholders a random prefix `pred<random>_` and a counter; `StringOptionsFilter` uses `stringOptionsFilter<random>`.

```sql
SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} and e.environment in {predab12cd_4:Array(String)})
  AND (nullIf(e.trace_name, '') IN ({stringOptionsFilteref34gh: Array(String)}))
  AND e.trace_id != '')
```

- `SELECT DISTINCT id FROM (...)` is added by `topicMatchingTraceIdsQuery` / `selectTopicCohortTraces` / `summarizedTopicMatchesQuery`; `selectTopicTraceRows` (Q28) uses the inner query directly and adds `e.trace_name AS trace_name`.
- The `(e.project_id = ... and ...)` group is the compiled rule filter plus the two `startTime` bounds. Its exact text depends on the rule's filter columns (tags become `traceTags`; metadata, level, type, name and so on render through `EVENTS_FIELD_LOWERINGS`). The lowercase `in` rendering of the environment condition is illustrative; the time bounds are certain.
- A score filter in the rule adds `scores_agg` / `trace_scores_agg` CTEs and LEFT JOINs (`events-observation-row-selection.ts:466-501`). A filter that needs full values (`requiresEventsFull`) switches `FROM events_core e` to `FROM events_full e`.
- `is_deleted` is not filtered here.
- Params: `projectId` (same value as the outer query's `{projectId:String}`), `pred*_1` = projectId, `pred*_2` = window from, `pred*_3` = window to (`'2026-11-12 00:00:00.000'` style), filter values (a few strings), trace names (1-20 names).

### F2: F1 restricted to summarized traces (refit filter)

`summarizedTopicMatchesQuery` (`trace-selection.ts:117-153`). Used only by Q15 when the rule has a filter. The events window ends one hour after the slice (`TRACE_SPAN_MARGIN_MS`, :35); the summary subquery uses the slice itself.

```sql
SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} and e.environment in {predab12cd_4:Array(String)})
  AND (nullIf(e.trace_name, '') IN ({stringOptionsFilteref34gh: Array(String)}))
  AND e.trace_id != ''
  AND e.trace_id IN (
        SELECT trace_id
        FROM topic_facet_summaries
        WHERE project_id = {summaryProjectId: String}
          AND unit_start_time >= {summaryFrom: DateTime64(3)}
          AND unit_start_time < {summaryTo: DateTime64(3)}
          AND facet_id = {summaryFacetId: String}
          AND facet_version = {summaryFacetVersion: UInt32}
          AND trace_id != ''
      ))
```

Params: `pred*_2` = slice from, `pred*_3` = slice to + 1 h, `summaryFrom`/`summaryTo` = slice (7, 7 or 16 days, see Q15), `summaryFacetId` = `'cmf4cetintent0001'`, `summaryFacetVersion` = 3.

---

## Q01: `getTopicDefinitions`

- Code: `packages/shared/src/server/topics/clickhouse.ts:139-188`. Route tag `topics-definitions`.
- Callers: `packages/shared/src/server/topics/postgres.ts:385` (`hydrateRuns`, used by `getTopicRun` :407, `getTopicRuns` :417, `getPublishedTopicRun` :470, `getTopicRuleMap` :624, `saveTopicRun` :655/:742), `postgres.ts:680` and `:705` (`saveTopicRun`: read existing, then read back after Q03).
- Use case: every place a run is loaded with its topics. Topics page counts and trace list (`resolveFacetMaps`, `web/src/features/topics/server/currentResults.ts:146-153`), scatter plot (`topicsRouter.ts:258`), trace header (`currentResults.ts:347`), public API/MCP assignments names (`publicApi.ts:479,795`), worker fits and online assignment (`worker/src/features/topics/servingRuns.ts:71`, cached per pod for completed runs).

```sql
SELECT project_id AS projectId, id AS topicVersionId,
        stable_id AS topicId, created_by_run_id AS createdByRunId,
        toUnixTimestamp64Milli(created_at) AS createdAtMs, name, description,
        centroid, radius, tags, representative_summaries AS representativeSummaries,
        metadata AS metadataJson
        FROM topics
        WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
          AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
        ORDER BY created_at DESC LIMIT 1 BY project_id, id
```

- Params: `projectId` `'cmproj0000example0001'`; `ids` = topic version ids of the runs (typically 10-100 per run, up to 1,000 per query); `from`/`to` = the runs' stored `config.definitionTimeRange` (min created_at to max + 1 ms; usually a few seconds wide, wider when several runs are hydrated together).
- Dedupe: `ORDER BY created_at DESC LIMIT 1 BY project_id, id`.
- Settings: none. Service: default.
- Loop: `chunk(unique ids, 1000)`, one query per chunk. Reads `centroid` (embedding-dimension doubles) per topic, so this is the heavy definition read.

## Q02: `getTopicNames`

- Code: `topics/clickhouse.ts:191-210`. Route tag `topics-names`.
- Callers: `postgres.ts:541` (`getPublishedTopicMaps`), which is called by `packages/shared/src/server/topics/trace-filter.ts:63` (topic filter on the events query), `web/src/features/topics/server/traceTopics.ts:10` (filter options) and `:36` (tracing table topic column).
- Use case: tracing table filter and column; comment at `postgres.ts:538` says these run on every tracing request with topics.

```sql
SELECT id AS topicVersionId, stable_id AS topicId, name
          FROM topics
          WHERE project_id = {projectId:String} AND id IN {ids:Array(String)}
            AND created_at >= {from:DateTime64(3)} AND created_at < {to:DateTime64(3)}
          ORDER BY created_at DESC LIMIT 1 BY project_id, id
```

- Params: `ids` = topic version ids of every current map of the project's facets (10-300); `from`/`to` = union of the maps' `definitionTimeRange` (can span weeks when maps were published on different days).
- Dedupe: `LIMIT 1 BY project_id, id`. Settings: none. Service: default. Loop: chunks of 1,000 ids.

## Q03: `writeTopicDefinitions` (INSERT)

- Code: `topics/clickhouse.ts:265-319`. log_comment route `topics-definitions`, surface `worker`.
- Callers: `postgres.ts:704` (`saveTopicRun`, when a run's new definitions are missing), from worker fits (`processTopicsExecution.ts` `clusterFacet`, :413 onward).
- Use case: writes.

```sql
INSERT INTO topics (project_id, id, stable_id, created_by_run_id,
        created_at, name, description, centroid, radius, tags,
        representative_summaries, metadata) FORMAT RowBinary
```

- Payload: one RowBinary row per new topic definition (typically 10-100 per run; centroid of `embeddingDimensions` Float64, e.g. 1536).
- Settings: `async_insert = 1`, `wait_for_async_insert = 1`. Service: default (`clickhouseClient().exec`).
- Loop: flush at 10,000 rows or 8 MiB. Followed by a Q01 read-back of the same ids.

## Q04: `hasStoredTopicSummaries`

- Code: `topics/clickhouse.ts:684-730`. Route tag `topics-has-summaries`.
- Callers: `web/src/features/topics/server/currentResults.ts:283` (`currentTopicResults`: Topics page counts, public API/MCP topics) and `:328` (`currentTopicRows`: trace header).
- Frequency: per call, but Redis-cached (`langfuse:topics:has-summaries:<projectId>`) for 1,800 s when true and 30 s when false.

```sql
SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND trace_id != '' AND processing_state = 'complete'
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String}
      LIMIT 1
```

- Params: `projectId`, environment constants. No time bound.
- Settings: `max_threads = 1`. Service: default. Dedupe: none needed.

## Q05: `hasTopicEmbeddings`

- Code: `topics/clickhouse.ts:672-681`. Route tag `topics-has-embeddings`.
- Caller: `packages/shared/src/server/topics/model-config.ts:498`, only when a model settings save changes the embedding model or dimensions.

```sql
SELECT 1 AS found FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND processing_state = 'complete'
      LIMIT 1
```

- No time bound, no settings, default service.

## Q06: `getTopicExecutionCosts`

- Code: `topics/clickhouse.ts:733-759`. Route tag `topics-execution-costs`. Errors are swallowed (returns `{}`).
- Callers: `web/src/features/topics/server/topicsRouter.ts:540` (`executions`: run history, every `process` execution id of the project) and `:557` (`execution` detail, one id). Skipped when the id list is empty.

```sql
SELECT JSONExtractString(metadata, 'executionId') AS executionId,
        sum(cost_details['total']) AS cost
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND executionId IN {executionIds:Array(String)}
        AND mapContains(cost_details, 'total')
      GROUP BY executionId
```

- Params: `executionIds` = process execution ids (1 to the full history list, typically under 50).
- No time bound: parses `metadata` JSON over every project summary. No dedupe (comment: retries overcount until merges). Settings: none. Service: default.

## Q07: `getTopicResultCounts`, summaries side

- Code: `packages/shared/src/server/repositories/topic-results.ts:680-765` (query at :711). Route tag `topics-counts`.
- Caller: `web/src/features/topics/server/currentResults.ts:193` (`facetMapCounts`), from `currentTopicResults` (`topicsRouter.ts:361` `currentResults`; `publicApi.ts:317` `loadPublicTopics` for `listPublicTopics` / `getPublicTopic` and MCP `list_topics`, `web/src/features/mcp/server/topics/tools.ts:113`) and from `analysisTopicResults` (`topicsRouter.ts:390`, snapshot results).
- Use case: Topics page counts per facet and topic.
- Frequency: per page load, one pair (Q07 + Q08, in parallel) per group of facets that share a window.

```sql
SELECT facet_id, uniqCombined(trace_id) AS total,
          uniqCombinedIf(trace_id, processing_state = 'complete') AS complete,
          uniqCombinedIf(trace_id, processing_state = 'complete'
            AND facet_version = {versions:Array(UInt32)}[indexOf({facetIds:Array(String)}, facet_id)]) AS usable,
          uniqCombinedIf(trace_id, processing_state = 'not_applicable') AS not_applicable,
          uniqCombinedIf(trace_id, processing_state = 'insufficient_input') AS insufficient_input
        FROM topic_facet_summaries WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
    AND trace_id != '' AND facet_id IN {facetIds:Array(String)}
    AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
    AND environment != {publicLlmJudgeEnvironment:String}
        GROUP BY facet_id
```

- Params: `facetIds` 1-5 (`['cmf4cetintent0001', 'cmf4cetissues0002']`); `versions` aligned (`[3, 1]`; 0 for no version); `runIds` (unused here); `from`/`to` = the facet's window: the published map's cohort `from` (clamped to now - 93 d) to now, or now - 7 d without a map; for an analysis, its fixed window; public API: requested window (default 7 d).
- Dedupe: none (approximate distinct traces with `uniqCombined`; re-summarized traces are not resolved).
- Options: `READ_OPTIONS` (ReadOnly, 10 s request timeout, `read_in_order_use_buffering = 0`, `cancel_http_readonly_queries_on_client_close = 1`).

## Q08: `getTopicResultCounts`, assignments side

- Code: `topic-results.ts:730-739`. Route tag `topics-counts`. Same callers, params and options as Q07, run in parallel with it.

```sql
SELECT facet_id, topic_id, grouping(topic_id) AS is_facet_total,
          uniqCombined(trace_id) AS count,
          uniqCombinedIf(trace_id, topic_id != '') AS assigned
        FROM topic_assignments
        WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
    AND trace_id != '' AND facet_id IN {facetIds:Array(String)}
    AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
    AND environment != {publicLlmJudgeEnvironment:String} AND clustering_run_id != ''
          AND clustering_run_id = {runIds:Array(String)}[indexOf({facetIds:Array(String)}, facet_id)]
        GROUP BY GROUPING SETS ((facet_id, topic_id), (facet_id))
```

- Params: `runIds` = each facet's published run id aligned with `facetIds` (`''` when the facet has no map).
- Dedupe: none (initial and online rows both count; `uniqCombined`).

## Q09: `listCurrentRows` candidate query

- Code: `candidateQuery` `topic-results.ts:314-417`, executed at :459. Route tag `topics-summaries-candidates` or `topics-assignments-candidates`.
- Callers:
  - `listCurrentTopicSummaries` (`topic-results.ts:560`) from `web/src/features/topics/server/currentResults.ts:490` (`listTopicTraces`, tRPC `topics.traces`, `topicsRouter.ts:366`: Topics page trace list and topic page, with topic, status, assigned or traceId filters) and `publicApi.ts:762` (`listPublicTopicSummaries`: `GET /api/public/unstable/topic-summaries`, MCP `list_topic_summaries` `tools.ts:208`).
  - `listCurrentTopicAssignments` (`topic-results.ts:624`) from `publicApi.ts:831` (`GET /api/public/unstable/topic-assignments`, MCP `list_topic_assignments` `tools.ts:248`).
- Loop: up to `maxBatches = 10` candidate batches per page. `batchSize = min(1000, max(200, limit * 4))`: 200 for the Topics page (limit 50) and public API limit up to 50; 400 for limit 100. Each batch runs Q09 then Q10; the cursor advances to the last candidate. A page stops when it has `limit` rows, a batch returns fewer than `batchSize` candidates, or 10 batches ran.
- `{from}`/`{to}` here are the full list window: Topics page = facet window (see Q07); public API = requested window up to 30 d (default 7 d), floored by plan data access, or the traces' own span for a traceId lookup (Q12).
- Options: `READ_OPTIONS`.

Placeholders `{p0}`, `{p1}`, ... come from a per-query counter (`SqlParams`, :98-106), so their numbers shift with the conditions present.

Variant C1, Topics page default list (summaries table, no filter, newest first), with a cursor from the second batch on:

```sql
SELECT facet_id, trace_id, unit_start_time
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id IN {facetIds:Array(String)}
        AND trace_id != '' AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String} AND (unit_start_time, trace_id, facet_id) < ({p0:DateTime64(3)}, {p1:String}, {p2:String})
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC,
        trace_id DESC, facet_id DESC
      LIMIT {batchSize:UInt32}
```

Variant C2, topic page (`topicIds any of`) or any filter that needs an assignment (`assigned = true`, statuses without `awaiting_map`, rule maps with several rules where `membersOnly` adds `assignmentStatus any of [assigned, outlier]`). Reads `topic_assignments`:

```sql
SELECT facet_id, trace_id, unit_start_time
      FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id IN {facetIds:Array(String)}
        AND clustering_run_id IN {p0:Array(String)} AND topic_id IN {p1:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String}
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC,
        trace_id DESC, facet_id DESC
      LIMIT {batchSize:UInt32}
```

`topic_id IN {p1}` becomes `topic_id != ''` for `assigned = true` or a single `assigned` status, `topic_id = ''` for a single `outlier` status, and is absent for `[assigned, outlier]`. `p0` = published run ids (1 per rule map of the facet). A cursor appends `AND (unit_start_time, trace_id, facet_id) < (...)`.

Variant C3, traceId lookup on summaries (`traceId any of`, no assignment filter: the Topics page trace search and the public API `traceId` filter). Environment conditions and the minute prefix are dropped so the `latest_source_versions` projection can serve it:

```sql
SELECT facet_id, trace_id, unit_start_time
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id IN {facetIds:Array(String)}
        AND trace_id IN {p0:Array(String)} AND trace_id != ''
      ORDER BY unit_start_time DESC,
        trace_id DESC, facet_id DESC
      LIMIT {batchSize:UInt32}
```

Variant C4, public API / MCP assignments (`kind = "assignments"`, one row per map):

```sql
SELECT facet_id, trace_id, unit_start_time, clustering_run_id AS run_id
      FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id IN {facetIds:Array(String)}
        AND clustering_run_id IN {p0:Array(String)} AND NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String} AND (unit_start_time, trace_id, facet_id, clustering_run_id) < ({p1:DateTime64(3)}, {p2:String}, {p3:String}, {p4:String})
      ORDER BY toStartOfMinute(unit_start_time) DESC, unit_start_time DESC,
        trace_id DESC, facet_id DESC, clustering_run_id DESC
      LIMIT {batchSize:UInt32}
```

Other conditions in the public API land in the candidate WHERE in filter order before `trace_id != ''`: `environment IN/NOT IN {pN:Array(String)}`, `unit_start_time >= {pN:DateTime64(3)}` (timestamp), and on the summaries table also `processed_at <op> {pN}` and `toString(processing_state) IN {pN}`. When statuses are a positive selection that includes `awaiting_map`, the summaries table gets `processing_state = 'complete'`. Ascending order flips `DESC` to `ASC` and `<` to `>`.

- Params: `facetIds` 1 (Topics page) or 1-5 (public API); `publishedRunIds`/`p0` 1-5 run ids; `batchSize` 200-400; `p0` trace ids in C3 up to 100 (public API limit `TOPIC_RESULT_FILTER_LIMITS.traceIds`) or 1 (Topics page search).
- Dedupe: none (candidates only; Q10 resolves).

## Q10: `listCurrentRows` resolve query

- Code: `topic-results.ts:474-528`, SQL from `currentResultsSql` (:182-236) and `resolveRowsSql` (:243-271). Route tag `topics-summaries` or `topics-assignments`.
- Callers and loop: same as Q09, one Q10 per non-empty candidate batch.
- `{from}`/`{to}` here are the candidates' own span (`min(unit_start_time)` to `max + 1 ms` of the batch), typically minutes to hours for the newest-first list. `{publishedRunIds}`: Topics page = the shown map's run id; public API summaries = every published run of the facets; public API assignments = the published runs after the ruleId filter.
- Options: `READ_OPTIONS`.

Variant R1, Topics page list (`listTopicTraces`, `includeAssignment: true`, `truncateSummaries: false`, no filters). Source `current` through the `ranked` CTE:

```sql
WITH 
  summaries AS (
    SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at,
      processing_state, summary, trace_name, environment
    FROM topic_facet_summaries
    WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)}
      AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
      AND environment != {publicLlmJudgeEnvironment:String}
      
      AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
          SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
          WHERE project_id = {projectId:String}
            AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
              SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
              WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)} AND trace_id IN {p0:Array(String)}
              GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
            )
          ORDER BY facet_version DESC, processed_at DESC
          LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')
        )
    -- The latest-summary filter leaves one version per trace and facet; this
    -- only drops not-yet-merged duplicates, so no ordering is needed.
    LIMIT 1 BY facet_id, trace_id
  ),
  assignments AS (
    SELECT trace_id AS a_trace_id, facet_id AS a_facet_id,
      facet_version AS a_facet_version, unit_start_time AS a_unit_start_time,
      summary_processed_at AS a_summary_processed_at, topic_id AS a_topic_id,
      topic_version_id AS a_topic_version_id, clustering_run_id AS a_run_id,
      assigned_at AS a_assigned_at
    FROM topic_assignments
    WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id IN {facetIds:Array(String)}
      AND clustering_run_id IN {publishedRunIds:Array(String)}
      AND trace_id IN {p0:Array(String)}
    ORDER BY facet_version DESC, assigned_at DESC, origin DESC
    LIMIT 1 BY a_facet_id, a_run_id, a_trace_id
  ),
  current AS (
    SELECT trace_id, facet_id, facet_version, unit_start_time, processed_at,
      processing_state, summary, trace_name, environment,
      processing_state = 'complete' AND a_trace_id != ''
        AND a_facet_version = facet_version AND a_unit_start_time = unit_start_time
        AND a_summary_processed_at = processed_at AS matched,
      if(matched, a_topic_id, '') AS topic_id,
      if(matched, a_topic_version_id, '') AS topic_version_id,
      if(matched, a_run_id, '') AS clustering_run_id,
      a_assigned_at AS assigned_at,
      multiIf(
        processing_state != 'complete', toString(processing_state),
        NOT matched, 'awaiting_map',
        topic_id != '', 'assigned',
        'outlier'
      ) AS topic_status
    FROM summaries
    LEFT JOIN assignments ON a_trace_id = trace_id AND a_facet_id = facet_id
  )
        , ranked AS (
      SELECT *,
        groupArrayIf(topic_id, topic_status = 'assigned') OVER (PARTITION BY facet_id, trace_id) AS key_topic_ids,
        row_number() OVER (PARTITION BY facet_id, trace_id ORDER BY
          matched DESC,
          topic_status = 'assigned' DESC, assigned_at DESC) AS key_rank
      FROM current WHERE has(arrayZip({p1:Array(String)}, {p2:Array(String)}, {p3:Array(DateTime64(3))}), (facet_id, trace_id, unit_start_time))
    )
    SELECT trace_id, facet_id, facet_version, unit_start_time, trace_name, environment,
      toString(processing_state) AS state,
      {truncate:Bool} AND lengthUTF8(summary) > {previewLength:UInt32} AS summary_truncated,
      if({truncate:Bool}, leftUTF8(summary, {previewLength:UInt32}), summary) AS summary_text,
      processed_at, topic_status, topic_id, topic_version_id, clustering_run_id FROM ranked WHERE key_rank = 1 
        ORDER BY unit_start_time DESC, trace_id DESC, facet_id DESC
```

- Params: `p0` = distinct candidate trace ids (up to `batchSize`, 200-400); `p1`/`p2`/`p3` = candidate facet ids, trace ids and unit start times (same length as the batch); `truncate` false (Topics page) or true/false (public API `truncateSummaries`); `previewLength` 500.
- With a topic filter (`topicIds any of [...]`, topic page): the summaries CTE is unchanged; after `p0` the counter adds `p1` for `hasAny(key_topic_ids, {p1:Array(String)})`, the tuples become `p2`-`p4`, and `p5` (the positive topic ids again) prefixes the window order: `ORDER BY (topic_status = 'assigned' AND topic_id IN {p5:Array(String)}) DESC, matched DESC, ...`, with `WHERE key_rank = 1 AND hasAny(key_topic_ids, {p1:Array(String)})`. Status filters add `AND topic_status IN {pN:Array(String)}` (or `NOT IN`), `assigned` adds `AND topic_status = 'assigned'` / `!= 'assigned'`, `none of` topics add `AND NOT hasAny(...)`.
- Summary conditions (environment, timestamp, processedAt, state, traceId) are added to the `summaries` CTE WHERE, after the `publicLlmJudgeEnvironment` line, as `AND environment IN {p0:Array(String)}` and so on; the `trace_id IN` placeholder then moves to the next number.

Variant R2, public API / MCP summaries without assignment filters (`includeAssignment` unset). Same `WITH summaries ..., assignments ..., current ...` text as R1 (the unused CTEs stay in the text), then:

```sql
        SELECT trace_id, facet_id, facet_version, unit_start_time, trace_name, environment,
      toString(processing_state) AS state,
      {truncate:Bool} AND lengthUTF8(summary) > {previewLength:UInt32} AS summary_truncated,
      if({truncate:Bool}, leftUTF8(summary, {previewLength:UInt32}), summary) AS summary_text,
      processed_at FROM summaries WHERE has(arrayZip({p1:Array(String)}, {p2:Array(String)}, {p3:Array(DateTime64(3))}), (facet_id, trace_id, unit_start_time)) 
        ORDER BY unit_start_time DESC, trace_id DESC, facet_id DESC
```

A topic or status filter on the summaries endpoint switches it to the R1 `ranked` form (with the summary select list and no assignment columns).

Variant R3, public API / MCP assignments (`perRun`). Same `WITH summaries ..., assignments ..., current ...` text as R1, then:

```sql
        SELECT trace_id, facet_id, facet_version, unit_start_time, topic_status,
      topic_id, topic_version_id, clustering_run_id, assigned_at FROM current WHERE has(arrayZip({p1:Array(String)}, {p2:Array(String)}, {p3:Array(DateTime64(3))}, {p4:Array(String)}), (facet_id, trace_id, unit_start_time, clustering_run_id)) AND topic_status IN ('assigned', 'outlier')
        ORDER BY unit_start_time DESC, trace_id DESC, facet_id DESC, clustering_run_id DESC
```

Here a topic filter is `(topic_status = 'assigned' AND topic_id IN {pN:Array(String)})` instead of `hasAny`.

- Dedupe: `latestSummaryFilterSql` (latest version per source via the inner `ORDER BY facet_version DESC, processed_at DESC LIMIT 1 BY facet_id, trace_id, if(...)`), then `LIMIT 1 BY facet_id, trace_id` on summaries; assignments `ORDER BY facet_version DESC, assigned_at DESC, origin DESC LIMIT 1 BY a_facet_id, a_run_id, a_trace_id`; R1 adds `row_number()` per `(facet_id, trace_id)`.

## Q11: `getLatestFacetSummaries`

- Code: `topics/clickhouse.ts:371-430`. Route tag `topics-latest-summaries`.
- Callers:
  - Variant S1, scatter plot: `web/src/features/topics/server/topicsRouter.ts:304` (`publishedTopicMap`, tRPC `topics.map` :644), with `facetVersion = run.facetVersion` and the map's discovery trace ids (from Q21).
  - Variant S2, trace header: `currentResults.ts:358` (`currentTopicRows` from `traceFacetResults`, tRPC `topics.forTrace` :413), no facet version, one trace id; runs once per shown facet, in parallel with Q18 and Q01.
- Loop: `chunk(traceIds, 1000)`; scatter maps of 5k-20k traces make 5-20 queries.

Variant S1 (`facetVersion` set):

```sql
SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId,
      processing_state AS state, summary, environment,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      toUnixTimestamp64Milli(processed_at) AS processedAtMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String}
    AND facet_version = {facetVersion:UInt32}
    AND trace_id IN {traceIds:Array(String)}
        AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
        SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
        WHERE project_id = {projectId:String}
          AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
            SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
            WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String}
        AND facet_version = {facetVersion:UInt32}
        AND trace_id IN {traceIds:Array(String)}
            GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
          )
        ORDER BY facet_version DESC, processed_at DESC
        LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
      )
      ORDER BY processed_at DESC
      LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
```

Variant S2 (no `facetVersion`; newest facet version wins):

```sql
SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId, session_id AS sessionId,
      processing_state AS state, summary, environment,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      toUnixTimestamp64Milli(processed_at) AS processedAtMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String}
    
    AND trace_id IN {traceIds:Array(String)}
        AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
        SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
        WHERE project_id = {projectId:String}
          AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
            SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
            WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String}
        AND trace_id IN {traceIds:Array(String)}
            GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
          )
        ORDER BY facet_version DESC, processed_at DESC
        LIMIT 1 BY facet_id, trace_id, if(trace_id = '', session_id, '')
      )
      ORDER BY facet_version DESC, processed_at DESC
      LIMIT 1 BY project_id, trace_id, if(trace_id = '', session_id, '')
```

- Params: S1: `from`/`to` = the run's cohort window (`run.config.timeRange`, 7-30 d), `traceIds` 1,000 per batch; S2: `from`/`to` = Q12's result (the trace's own summary span, usually one instant + 1 ms), `traceIds` = `[traceId]`.
- Dedupe: nested `latestSummaryFilterSql` plus outer `LIMIT 1 BY`. Internal-eval environments are filtered in JS afterwards, not in SQL.
- Settings: none. Service: default.

## Q12: `getTopicTraceUnitTimeRange`

- Code: `topics/clickhouse.ts:1316-1339`. Route tag `topics-trace-unit-time`.
- Callers: `currentResults.ts:414` (`traceFacetResults`, trace header, one trace id, window = trace timestamp ± 2 days) and `publicApi.ts:683` (`resultsWindow`: public API/MCP summaries or assignments with a `traceId any of` filter and no explicit window; up to 100 ids; window = now - 93 d (floored by plan) to now).

```sql
SELECT count() AS found,
      toUnixTimestamp64Milli(min(unit_start_time)) AS fromMs,
      toUnixTimestamp64Milli(max(unit_start_time)) AS toMs
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id IN {traceIds:Array(String)}
```

- Dedupe: none (min/max). Settings: none. Service: default. Comment says it is served by the `latest_source_versions` projection.

## Q13: `getTopicSummaryCounts`

- Code: `topics/clickhouse.ts:765-830`. Route tag `topics-summary-counts`.
- Callers:
  - `web/src/features/topics/server/slices.ts:117` (`previewTopicAnalysis`, tRPC `topics.previewAnalysis` and again inside `startAnalysis` via `slices.ts:163`): with cohort (traces = F1 over the snapshot window and filter, sample seed `'topics-analysis'`, limit 20,000), all selected facets.
  - `topics/clickhouse.ts:516` (`getTopicClusteringSummaries` precheck, Q14): one facet, same cohort as the snapshot.
  - `worker/src/features/topics/nightlyRefit.ts:282` (`hasNewSummaries`): no cohort, one facet, window from the previous map's `timeRange.to` (floored at now - 93 d) to now, typically about one day. Runs in the nightly scheduler for each rule and facet whose map is not provisional, before creating a refit run (runner every 5 min, each project once a day at its slot).

Without cohort:

```sql
SELECT facet_id AS facetId, facet_version AS facetVersion, count() AS count FROM (
      SELECT facet_id, facet_version, trace_id FROM (
        SELECT facet_id, facet_version, trace_id, processing_state, embedding_model, length(embedding) AS dimensions, environment
        FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != ''
    AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
          AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
              SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
              WHERE project_id = {projectId:String}
                AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
                  SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
                  WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != ''
              AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
                  GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
                )
              ORDER BY facet_version DESC, processed_at DESC
              LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
            )
        ORDER BY processed_at DESC
        LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
      ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
        AND dimensions = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String}
      
    )
    GROUP BY facet_id, facet_version
```

With cohort (snapshot preview and precheck), the inner filter and sample become:

```sql
        AND environment != {publicLlmJudgeEnvironment:String} AND trace_id IN (SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')})
  AND e.trace_id != ''))
      ORDER BY cityHash64(trace_id, {cohortSeed:String}), trace_id
      LIMIT {cohortLimit:UInt64} BY facet_id, facet_version
    )
    GROUP BY facet_id, facet_version
```

(The events subquery is F1; it carries the snapshot's own filter conditions when it has any.)

- Params: `facetIds`/`facetVersions` 1-5 aligned; `embeddingModel` `'text-embedding-3-small'`, `embeddingDimensions` 1536; window: snapshot range (up to 30 d) or nightly ~1 d; `cohortSeed` `'topics-analysis'` (preview) or the analysis seed (fit), `cohortLimit` 20,000.
- Dedupe: `latestSummaryFilterSql` + `ORDER BY processed_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(...)`.
- Options with cohort: `preferredClickhouseService: "EventsReadOnly"`, `request_timeout = 45000` ms, `max_execution_time = 30`, `timeout_overflow_mode = 'throw'`. Without cohort: none, default service.

## Q14: `getTopicClusteringSummaries` (stream)

- Code: `topics/clickhouse.ts:498-569`. Route tag `topics-clustering-summaries`.
- Caller: `worker/src/features/topics/processTopicsExecution.ts:747` (`updateTopics` from `processTopicUpdateExecution` :817): snapshot (analysis) fits. The cohort is `topicAnalysisCohort` (`packages/shared/src/server/topics/slices.ts:15`), F1 plus a seeded sample of 20,000.
- Steps: Q13 precheck first (throws when count > 20,000 or count × dims × 8 > 256 MiB), then this stream.
- Frequency: once per facet of a snapshot execution (and on resume).

```sql
SELECT project_id AS projectId, facet_id AS facetId,
  facet_version AS facetVersion,
  trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
  processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion,
  summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails,
  provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson FROM (
      SELECT * FROM (
        SELECT *, length(embedding) AS dimensions FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id = {facetId:String}
  AND facet_version = {facetVersion:UInt32}
          AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
            SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
            WHERE project_id = {projectId:String}
              AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
                SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
                WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id = {facetId:String}
          AND facet_version = {facetVersion:UInt32}
                GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
              )
            ORDER BY facet_version DESC, processed_at DESC
            LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
          )
        ORDER BY processed_at DESC
        LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
      ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
        AND dimensions = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String} AND trace_id IN (SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')})
  AND e.trace_id != ''))
      ORDER BY cityHash64(trace_id, {cohortSeed:String}), trace_id
      LIMIT {cohortLimit:UInt64}
    )
        ORDER BY trace_id LIMIT {maximumRows:UInt64}
```

- Without a cohort (a non-analysis update execution) the `AND trace_id IN (...)` and the `ORDER BY cityHash64 ... LIMIT {cohortLimit}` lines are absent.
- Params: window = snapshot range (up to 30 d); `cohortSeed` = analysis seed; `cohortLimit` 20,000; `maximumRows` 20,001.
- Dedupe: as Q13.
- Settings: `max_result_bytes = '268435456'`, `result_overflow_mode = 'throw'`. Service: default (not EventsReadOnly, although it scans events through the cohort).

## Q15: `getNewestTopicClusteringSummaries` (stream)

- Code: `topics/clickhouse.ts:580-670`. Route tag `topics-newest-clustering-summaries`.
- Caller: `processTopicsExecution.ts:935` (`refitCohort` in `processTopicRuleRefit` :984). Rule refit runs come from the nightly scheduler (`nightlyRefit.ts:226-240`, window now - 30 d to now), the rule setup fit (`ruleSetup.ts` `startFit`) and manual refresh (`topicsRouter.ts:595`). With a rule filter, each step's `traces` is F2 for that slice.
- Loop: up to three steps, newest first. Step slices relative to the scheduled `to`: `[to - 7 d, to)`, `[to - 14 d, to - 7 d)`, `[from, to - 14 d)` (the last reaches the scheduled `from`, 30 d for nightly). It stops when a step fills its `limit` or the budget runs out. A later step's failure keeps earlier rows; the first step's failure throws.
- Frequency: once per facet per rule refit (nightly per rule and facet, plus setup and manual refreshes).

```sql
SELECT project_id AS projectId, facet_id AS facetId,
  facet_version AS facetVersion,
  trace_id AS traceId, session_id AS sessionId, trigger_type AS triggerType,
  environment, trace_name AS traceName,
  toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
  processing_state AS state, summary, embedding,
  transcript_id AS transcriptId, transcript_version AS transcriptVersion,
  summary_model AS summaryModel, embedding_model AS embeddingModel,
  provided_usage_details AS providedUsageDetails, usage_details AS usageDetails,
  provided_cost_details AS providedCostDetails, cost_details AS costDetails,
  toUnixTimestamp64Milli(processed_at) AS processedAtMs, metadata AS metadataJson FROM topic_facet_summaries
          WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
            AND trace_id != '' AND facet_id = {facetId:String}
  AND facet_version = {facetVersion:UInt32}
            AND (trace_id, unit_start_time, processed_at) IN (SELECT trace_id, unit_start_time, processed_at FROM (
      SELECT * FROM (
        SELECT trace_id, unit_start_time, processed_at, processing_state, embedding_model, environment, length(embedding) AS dimensions FROM topic_facet_summaries
        WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id = {facetId:String}
  AND facet_version = {facetVersion:UInt32}
          AND (facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at) IN (
            SELECT facet_id, facet_version, trace_id, if(trace_id = '', session_id, ''), unit_start_time, processed_at FROM topic_facet_summaries
            WHERE project_id = {projectId:String}
              AND (facet_id, trace_id, if(trace_id = '', session_id, '')) IN (
                SELECT facet_id, trace_id, if(trace_id = '', session_id, '') FROM topic_facet_summaries
                WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND trace_id != '' AND facet_id = {facetId:String}
          AND facet_version = {facetVersion:UInt32}
                GROUP BY facet_id, trace_id, if(trace_id = '', session_id, '')
              )
            ORDER BY facet_version DESC, processed_at DESC
            LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
          )
        ORDER BY processed_at DESC
        LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
      ) WHERE processing_state = 'complete' AND embedding_model = {embeddingModel:String}
        AND dimensions = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String}
      
    )
        ORDER BY unit_start_time DESC, trace_id LIMIT {limit:UInt64})
          ORDER BY unit_start_time DESC, trace_id
          LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
```

With a rule filter, the line after `{publicLlmJudgeEnvironment:String}` gains ` AND trace_id IN (<F2 for this slice>)`.

- Params: `from`/`to` = the step slice; `facetId`, `facetVersion`; `embeddingModel`, `embeddingDimensions` (1536); `limit` = `min(16000 - loaded, floor((214748364 - bytes) / (dims * 8 + 2048)))`, about 14,979 rows for 1536 dims on the first step.
- Dedupe: the inner key query uses `latestSummaryFilterSql` and `LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(...)`; the outer payload read repeats `LIMIT 1 BY` on the same key.
- Options: `preferredClickhouseService: "EventsReadOnly"`, `request_timeout = 75000` ms, `max_threads = 2`, `max_execution_time = 60`, `timeout_overflow_mode = 'throw'`. The reader stops early when decoded bytes exceed the budget.

## Q16: `getTopicSetupSummaryCounts`

- Code: `topics/clickhouse.ts:838-874`. Route tag `topics-setup-summary-counts`.
- Caller: `worker/src/features/topics/ruleSetup.ts:210` (`selectAndSeed`, first tick of a rule setup). Loop over `TOPIC_SETUP_WINDOW_DAYS` 7, 14, 30 for facets without a map; stops once every open facet has 400 summaries or the seeded traces cover the shortfall. Window = setup start - days - 5 min to now. With a rule filter, `traces` = F1 over the same window.

```sql
SELECT facet_id AS facetId, uniqCombined(trace_id) AS count
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND trace_id != ''
        AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
        AND processing_state = 'complete'
        AND embedding_model = {embeddingModel:String}
        AND length(embedding) = {embeddingDimensions:UInt32}
        AND NOT startsWith(environment, {internalEnvironmentPrefix:String})
        AND environment != {publicLlmJudgeEnvironment:String} AND trace_id IN (SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} and e.environment in {predab12cd_4:Array(String)})
  AND (nullIf(e.trace_name, '') IN ({stringOptionsFilteref34gh: Array(String)}))
  AND e.trace_id != ''))
      GROUP BY facet_id
```

Without a rule filter the `AND trace_id IN (...)` part is absent.

- Params: `facetIds`/`facetVersions` 1-5; window 7/14/30 d (+ 5 min).
- Dedupe: none (`uniqCombined` over complete rows of the exact facet version).
- Settings: none. Service: default (also when it scans events through the filter).

## Q17: `countTopicTraceSummaries`

- Code: `topics/clickhouse.ts:880-926`. Route tag `topics-setup-progress`.
- Callers:
  - `ruleSetup.ts:259`: once after seeding, `since = 1970-01-01`, traceIds = the seeded ids (up to 500), to subtract traces already summarized.
  - `ruleSetup.ts:310` (`fitSettledFacets`): every 15 s tick while the setup is `summarizing`, `since` = setup start, traceIds = the stored seeded ids (up to 500), `from` = earliest seeded trace start.
  - `worker/src/features/topics/snapshotSetup.ts:270` (`settle`): every 15 s tick of a summarizing snapshot (deadline 8 min), traceIds up to 1,000.

```sql
SELECT facet_id AS facetId,
        uniqExact(trace_id) AS settled,
        uniqExactIf(trace_id, processing_state = 'complete'
          AND embedding_model = {embeddingModel:String}
          AND length(embedding) = {embeddingDimensions:UInt32}) AS complete
      FROM topic_facet_summaries
      WHERE project_id = {projectId:String}
        AND unit_start_time >= {from:DateTime64(3)}
        AND trace_id IN {traceIds:Array(String)}
        AND (facet_id, facet_version) IN arrayZip({facetIds:Array(String)}, {facetVersions:Array(UInt32)})
        AND processed_at >= {since:DateTime64(3)}
      GROUP BY facet_id
```

- No upper time bound; one query with every trace id (no batching). Dedupe: `uniqExact`. Settings: none. Service: default.

## Q18: `readLatestTopicAssignments`

- Code: `topics/clickhouse.ts:1182-1207`. Route tag `topics-current-assignments`.
- Caller: `currentResults.ts:351` (`currentTopicRows`, trace header via tRPC `topics.forTrace`), once per shown facet with `traceIds = [traceId]`, window = Q12's result. Skipped when the facet has no published map.

```sql
SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      environment, trace_name AS traceName,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      coordinates,
      toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
      clustering_run_id AS runId,
      topic_id AS topicId, topic_version_id AS topicVersionId, distance,
      runner_up_distance AS runnerUpDistance, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id = {facetId:String}
        AND clustering_run_id IN {publishedRunIds:Array(String)}
        AND trace_id IN {traceIds:Array(String)}
      ORDER BY facet_version DESC, assigned_at DESC, origin DESC
      LIMIT 1 BY project_id, facet_id, clustering_run_id, trace_id, if(trace_id = '', session_id, '')
```

- Params: `publishedRunIds` 1-3 (one per rule map of the facet); `traceIds` 1. Without `traceIds` the `AND trace_id IN` line is absent (no caller does that on `main`).
- Dedupe: `LIMIT 1 BY ... clustering_run_id, trace_id, ...` after `ORDER BY facet_version DESC, assigned_at DESC, origin DESC`. Settings: none. Service: default.

## Q19: `readCurrentTraceTopics`

- Code: `topics/clickhouse.ts:1210-1250`, SQL from `currentTraceAssignmentsSql` (:1306-1313). Route tag `topics-trace-topics`.
- Caller: `web/src/features/topics/server/traceTopics.ts:40` (`tracesTopics`, tRPC `topics.forTraces`, `topicsRouter.ts:370`): the tracing table's topic column, loaded after the rows. Preceded by Q02 through `getPublishedTopicMaps`.

```sql
SELECT trace_id AS traceId, facet_id AS facetId, topic_id AS topicId,
        topic_version_id AS topicVersionId, clustering_run_id AS runId
      FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id
    FROM topic_assignments
    WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND facet_id IN {facetIds:Array(String)} AND trace_id IN {traceIds:Array(String)}
      AND clustering_run_id IN {publishedRunIds:Array(String)}
    ORDER BY assigned_at DESC, origin DESC
    LIMIT 1 BY facet_id, clustering_run_id, trace_id)
```

- Params: `traceIds` = distinct ids of the visible page (input max 500, typically 50-100); `facetIds` = every facet of the project (1-5); `publishedRunIds` = every current map (1-10); `from` = min trace timestamp - 2 d, `to` = max trace timestamp + 1 ms.
- Dedupe: `ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id`. Settings: none. Service: default.

## Q20: `currentTopicTraceIdsCondition` (tracing table topic filter)

- Code: `topics/clickhouse.ts:1256-1303`, built by `topicFilterConditions` (`packages/shared/src/server/topics/trace-filter.ts:42-89`), spliced into the events table query by `getObservationsFromEventsTableInternal` (`packages/shared/src/server/repositories/events.ts:989, 1007-1008`).
- Use case: tracing (events/observations v4) table and its counts when the user filters on a topic. Preceded by Q02.
- Frequency: every events table request with a topic filter, for both the rows and the count query; one condition per topic filter (prefix `topicFilter0`, `topicFilter1`, ...).

Condition (prefix `topicFilter0`, positive filter; `none of` uses `NOT IN`):

```sql
e.trace_id IN (SELECT trace_id FROM (SELECT trace_id, facet_id, topic_id, topic_version_id, clustering_run_id
    FROM topic_assignments
    WHERE project_id = {topicFilter0_projectId:String} AND unit_start_time >= {topicFilter0_from:DateTime64(3)} AND unit_start_time < {topicFilter0_to:DateTime64(3)} AND facet_id = {topicFilter0_facetId:String} AND trace_id != '' AND trace_id IN (
      SELECT trace_id FROM topic_assignments
      WHERE project_id = {topicFilter0_projectId:String} AND unit_start_time >= {topicFilter0_from:DateTime64(3)} AND unit_start_time < {topicFilter0_to:DateTime64(3)}
        AND facet_id = {topicFilter0_facetId:String} AND clustering_run_id IN {topicFilter0_publishedRunIds:Array(String)}
        AND topic_id IN {topicFilter0_topicIds:Array(String)}
    )
      AND clustering_run_id IN {topicFilter0_publishedRunIds:Array(String)}
    ORDER BY assigned_at DESC, origin DESC
    LIMIT 1 BY facet_id, clustering_run_id, trace_id) WHERE topic_id IN {topicFilter0_topicIds:Array(String)})
```

Host query skeleton (observations list, rows variant; the count variant swaps the select list for the count field set):

```sql
SELECT
  <events base + calculated field set>
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} <and other table filters>)
  AND e.trace_id IN (<condition above>)
ORDER BY e.project_id DESC, toStartOfMinute(e.start_time) DESC, e.start_time DESC, ...
LIMIT {limit: Int32} OFFSET {offset: Int32}
```

- Params: `topicFilter0_from` = the table's lower `startTime` bound - 2 d, `topicFilter0_to` = the tightest upper bound + 1 ms (or now + 1 ms); window at most 93 days (wider throws). `topicFilter0_topicIds` = stable topic ids whose name matches across the facet's maps (1-10); `topicFilter0_publishedRunIds` = every current map run id (1-10). Non-overlapping dates give `0 = 1` instead; an unknown topic gives `0 = 1` (positive) or nothing (negated).
- Dedupe: inner `ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY facet_id, clustering_run_id, trace_id`, prefiltered by the `trace_id IN (... topic_id IN ...)` subquery.
- Settings/service: those of the host events query (the observations list's own options).

## Q21: `readTopicMapAssignments`

- Code: `topics/clickhouse.ts:1123-1147`. Route tag `topics-map`.
- Callers: `topicsRouter.ts:273` (`publishedTopicMap`, tRPC `topics.map`: scatter plot; followed by Q11 S1) and `processTopicsExecution.ts:706` (worker resume when the facet's run already completed).

```sql
SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      environment, trace_name AS traceName,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      coordinates,
      toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
      clustering_run_id AS runId,
      topic_id AS topicId, topic_version_id AS topicVersionId, distance,
      runner_up_distance AS runnerUpDistance, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String}
        AND origin = 'initial' AND trace_id != ''
      ORDER BY assigned_at DESC
      LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
```

- Params: `runId` one run; window = the run's cohort `config.timeRange` (7-30 d). Returns the discovery cohort, up to about 16,000-20,000 rows.
- Dedupe: `ORDER BY assigned_at DESC LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(...)`. Settings: none. Service: default.

## Q22: `readTopicRunTraceIds`

- Code: `topics/clickhouse.ts:1085-1120`. Route tag `topics-run-summaries`.
- Caller: `processTopicsExecution.ts:361` (`clusterFacet`, when the fit continues a previous map), followed by Q23 in batches of 1,000.

```sql
SELECT DISTINCT trace_id AS traceId FROM topic_assignments
      WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)} AND clustering_run_id = {runId:String}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND origin = 'initial'
        AND trace_id != ''
      ORDER BY traceId LIMIT {maximumRows:UInt64}
```

- Params: `runId` = the previous map's run; window = its cohort range (7-30 d); `maximumRows` 20,001.
- Dedupe: `DISTINCT`. Settings: none. Service: default.

## Q23: `readTopicAssignments`

- Code: `topics/clickhouse.ts:1149-1179`. Route tag `topics-assignments`.
- Callers: `processTopicsExecution.ts:178` (`assignSummaries`: read-back after each Q25 insert of 1,000 summaries, window = that batch's unit start span) and `:374` (previous memberships, 1,000 trace ids per batch over the previous map's cohort window).
- Loop: `sourceBatches` dedupes sources and chunks them by 1,000.

```sql
SELECT project_id AS projectId, facet_id AS facetId,
      facet_version AS facetVersion, trace_id AS traceId,
      session_id AS sessionId,
      environment, trace_name AS traceName,
      toUnixTimestamp64Milli(unit_start_time) AS unitStartTimeMs,
      coordinates,
      toUnixTimestamp64Milli(summary_processed_at) AS summaryProcessedAtMs,
      clustering_run_id AS runId,
      topic_id AS topicId, topic_version_id AS topicVersionId, distance,
      runner_up_distance AS runnerUpDistance, origin,
      toUnixTimestamp64Milli(assigned_at) AS assignedAtMs
      FROM topic_assignments WHERE project_id = {projectId:String} AND unit_start_time >= {from:DateTime64(3)} AND unit_start_time < {to:DateTime64(3)}
        AND facet_id = {facetId:String} AND facet_version = {facetVersion:UInt32}
        AND clustering_run_id = {runId:String} AND (trace_id, if(trace_id = '', session_id, '')) IN arrayZip({traceIds:Array(String)}, {sessionIds:Array(String)})
      ORDER BY assigned_at DESC, origin DESC
      LIMIT 1 BY project_id, facet_id, facet_version, trace_id, if(trace_id = '', session_id, '')
```

- Params: `traceIds` 1,000 ids; `sessionIds` 1,000 empty strings (trace sources).
- Dedupe: `ORDER BY assigned_at DESC, origin DESC LIMIT 1 BY` source key. Settings: none. Service: default.

## Q24: summary writes (`topic_facet_summaries` INSERT)

- Production path: `worker/src/features/topics/processTopicsTrace.ts:168-183` (`storeSummaries`) queues `topicSummaryRecord(row)` (`topics/clickhouse.ts:968-995`) on `ClickhouseWriter` (`TableName.TopicFacetSummaries`, `worker/src/services/ClickhouseWriter/types.ts:25`). The writer flushes with `jsonWriteStrategy` (`worker/src/services/ClickhouseWriter/writeStrategies.ts:42-50`).
- Other path: `writeTopicSummaries` (`topics/clickhouse.ts:938`) through `insertTopicRows`; on `main` only the seeder calls it (`packages/shared/scripts/seeder/scenarios/topics-map.ts:350`).
- Frequency: one row per summarized trace and facet (Topics trace queue job).

```sql
INSERT INTO topic_facet_summaries FORMAT JSONEachRow
```

Row columns: `project_id, facet_id, facet_version, trace_id, session_id, trigger_type, environment, trace_name, unit_start_time, processing_state, summary, embedding, transcript_id, transcript_version, summary_model, embedding_model, provided_usage_details, usage_details, provided_cost_details, cost_details, processed_at, metadata`.

- Settings: client-forced `async_insert = 1`, `wait_for_async_insert = 1` (`packages/shared/src/server/clickhouse/client.ts:249-250`), plus env-tunable async insert sizes; `log_comment` route `clickhouse-writer` (multi-project). `writeTopicSummaries` instead uses route `topics-summaries` and flushes at 10,000 rows / 8 MiB.
- Side effect: the `billable_events_topic_facet_summaries_mv` view inserts into `billable_events` (rows not `insufficient_input`, `processed_at` within 48 h).

## Q25: `writeTopicAssignments` (initial assignments INSERT)

- Code: `topics/clickhouse.ts:945-965`, `insertTopicRows` :97-137, record `topicAssignmentRecord` :1003-1027. log_comment route `topics-assignments`.
- Callers: `processTopicsExecution.ts:175` (`assignSummaries` in every fit: snapshot, refit, setup), seeder `topics-map.ts:457`.
- Loop: `assignSummaries` writes 1,000 summaries per call, each followed by Q23 read-back; `insertTopicRows` would also split at 10,000 rows / 8 MiB.

```sql
INSERT INTO topic_assignments FORMAT JSONEachRow
```

Row columns: `project_id, facet_id, facet_version, trace_id, session_id, unit_start_time, summary_processed_at, environment, trace_name, clustering_run_id, topic_id, topic_version_id, distance, runner_up_distance, origin ('initial'), coordinates, assigned_at`.

- Settings: `async_insert = 1`, `wait_for_async_insert = 1`. Service: default.

## Q26: online assignment writes (`topic_assignments` INSERT)

- Code: `processTopicsTrace.ts:191-240` (`assignSummaries`), queued on `ClickhouseWriter` (`TableName.TopicAssignments`). The rule's map comes from `getRuleTopicRun` (`worker/src/features/topics/servingRuns.ts:88`; serving run id cached 60 s, completed runs cached per pod, so Q01 is rare here).
- Frequency: per complete trace summary, per matching rule that has a compatible map; `origin = 'online'`.

```sql
INSERT INTO topic_assignments FORMAT JSONEachRow
```

- Settings: as Q24 (writer path).

## Q27: `countTopicCohortTraces`

- Code: `packages/shared/src/server/topics/trace-selection.ts:180-196`. Route tag `topics-cohort-count`.
- Caller: `web/src/features/topics/server/slices.ts:116` (`previewTopicAnalysis`: tRPC `topics.previewAnalysis` and `startAnalysis`), in parallel with Q13 (cohort) and Q29 (summarized variant).

```sql
SELECT count() AS count FROM (SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} <and the snapshot's filter>)
  AND e.trace_id != ''))
```

- Params: snapshot window (up to 30 d) and filter. When comment filters exclude everything, the inner query is `SELECT '' AS id LIMIT 0`.
- Settings: `max_threads = 2`, `max_execution_time = 30`, `timeout_overflow_mode = 'throw'`. Service: `EventsReadOnly`. Dedupe: `DISTINCT`.

## Q28: `selectTopicTraceRows`

- Code: `trace-selection.ts:199-277`. Route tag `topics-trace-selection`.
- Caller: `web/src/features/topics/server/traceSelection.ts:38` (`previewTopicTraces`, tRPC `topics.previewTraces`, `topicsRouter.ts:420`): setup dialog trace preview.

```sql
WITH matching_traces AS (WITH matching_observations AS (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment,
  e.trace_name AS trace_name
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} <and rule filter>)
  AND (nullIf(e.trace_name, '') IN ({stringOptionsFilteref34gh: Array(String)}))
  AND e.trace_id != '')
SELECT
  m.id AS id,
  max(m.start_time) AS latest_match,
  argMax(m.environment, tuple(m.event_ts, m.span_id, m.environment)) AS environment,
  min(m.start_time) AS timestamp,
  anyIf(m.trace_name, m.trace_name != '') AS name
FROM matching_observations m
GROUP BY m.id
HAVING NOT startsWith(environment, {internalEnvironmentPrefix:String}) AND environment != {publicLlmJudgeEnvironment:String})
SELECT
  t.id AS id,
  toUnixTimestamp64Milli(t.timestamp) AS timestampMs,
  count() OVER () AS matchedTraceCount,
  t.name AS name,
  t.environment AS environment
FROM matching_traces t
ORDER BY cityHash64(t.id, {samplingSeed: String}) ASC, t.id ASC
LIMIT {limit: Int32}
```

- `sampling = "latest"` orders by `t.latest_match DESC, t.id ASC` instead. The `traceName` line appears only with a trace name filter.
- Params: window = dialog range (max 30 d), `limit` = min(requested, 20), `samplingSeed` e.g. `'setup-preview-1'`.
- Settings: `max_threads = 2`, `max_execution_time = 30`, `timeout_overflow_mode = 'throw'`. Service: `EventsReadOnly`. Dedupe: `GROUP BY m.id`; `count() OVER ()` counts every matching trace.

## Q29: `getTopicSetupTraceCount`

- Code: `packages/shared/src/server/repositories/topic-setup-events.ts:81-106`, SQL `topicSetupTracesSql` :36-59, `summarizedTraceIdsSql` :23-32. Route tag `topics-setup-counts`.
- Callers: `web/src/features/topics/server/traceSelection.ts:99` (`countTopicSetupTraces`, tRPC `topics.setupTraceCounts` `topicsRouter.ts:563`: 7 d, then 30 d unless the 7 d count × 0.01 ≥ 500, i.e. ≥ 50,000 traces) and `:141` (`countUnsummarizedTopicTraces`, from the snapshot preview `slices.ts:125`, with `summarized`, idle × 2, days = first of 7/14/30 covering the range, `now` = range end; errors swallowed).

Full form (rule filter and `summarized` present; `days` is inlined as a literal):

```sql
      SELECT count() AS count
      FROM (
  SELECT trace_id, max(event_ts) AS last_ts
  FROM events_core
  WHERE project_id = {projectId: String}
    AND start_time >= {now: DateTime64(3)} - INTERVAL 7 DAY
    AND trace_id != ''
    AND is_deleted = 0
    AND NOT startsWith(environment, {internalEnvironmentPrefix: String})
    AND environment != {publicLlmJudgeEnvironment: String}
    AND trace_id IN (SELECT DISTINCT id FROM (SELECT
  e.trace_id AS id,
  e.start_time AS start_time,
  e.span_id AS span_id,
  e.event_ts AS event_ts,
  e.environment AS environment
FROM events_core e
WHERE e.project_id = {projectId: String}
  AND (e.project_id = {predab12cd_1:String} and e.start_time >= {predab12cd_2:DateTime64(3, 'UTC')} and e.start_time < {predab12cd_3:DateTime64(3, 'UTC')} and e.environment in {predab12cd_4:Array(String)})
  AND (nullIf(e.trace_name, '') IN ({stringOptionsFilteref34gh: Array(String)}))
  AND e.trace_id != ''))
    AND trace_id NOT IN (
  SELECT trace_id
  FROM topic_facet_summaries
  WHERE project_id = {projectId: String}
    AND unit_start_time >= {now: DateTime64(3)} - INTERVAL 7 DAY
    AND trace_id != ''
    AND (facet_id, facet_version) IN arrayZip({facetIds: Array(String)}, {facetVersions: Array(UInt32)})
    AND (processing_state != 'complete' OR (embedding_model = {embeddingModel: String} AND length(embedding) = {embeddingDimensions: UInt32}))
  GROUP BY trace_id
  HAVING uniqExact(facet_id) = length({facetIds: Array(String)}))
    
  GROUP BY trace_id
  HAVING last_ts < {now: DateTime64(3)} - toIntervalMillisecond({idleMs: UInt32}))
```

- The setup dialog variant has no `NOT IN` block; without a rule filter the `trace_id IN (...)` block is absent (no F1 query).
- Params: `now` = request time (dialog) or snapshot range end; `idleMs` = project trace idle wait (default 600,000) or twice it; F1 window = now - days to now; `facetIds`/`facetVersions` 1-5.
- Settings: `max_execution_time = 10`. Service: `EventsReadOnly`. Dedupe: `GROUP BY trace_id`.

## Q30: `getTopicSetupTraceIds`

- Code: `topic-setup-events.ts:112-147`. Route tag `topics-setup-traces`.
- Callers: `worker/src/features/topics/ruleSetup.ts:227` (`selectAndSeed`: per window 7/14/30 until the shortfall is covered; `limit` = 500 - fewest existing summaries; `sampling` = rule sampling; `seed` = rule id; `summarized` always set; random order) and `worker/src/features/topics/snapshotSetup.ts:148` (`seed`: once, `sampling` 1, `limit` ≤ 1,000, `seed` = execution id, `order` random or latest, idle × 2, `now` = range end).

Full form (sampled, filter, summarized, random order):

```sql
  SELECT trace_id, max(event_ts) AS last_ts
  FROM events_core
  WHERE project_id = {projectId: String}
    AND start_time >= {now: DateTime64(3)} - INTERVAL 14 DAY
    AND trace_id != ''
    AND is_deleted = 0
    AND NOT startsWith(environment, {internalEnvironmentPrefix: String})
    AND environment != {publicLlmJudgeEnvironment: String}
    AND trace_id IN (SELECT DISTINCT id FROM (<F1 over the setup window>))
    AND trace_id NOT IN (
  SELECT trace_id
  FROM topic_facet_summaries
  WHERE project_id = {projectId: String}
    AND unit_start_time >= {now: DateTime64(3)} - INTERVAL 14 DAY
    AND trace_id != ''
    AND (facet_id, facet_version) IN arrayZip({facetIds: Array(String)}, {facetVersions: Array(UInt32)})
    AND (processing_state != 'complete' OR (embedding_model = {embeddingModel: String} AND length(embedding) = {embeddingDimensions: UInt32}))
  GROUP BY trace_id
  HAVING uniqExact(facet_id) = length({facetIds: Array(String)}))
    AND bitShiftRight(reinterpretAsUInt64(reverse(substring(SHA256(concat('langfuse:evaluation-sampling:v1', char(0), trace_id)), 1, 8))), 11) < {sampling: Float64} * 9007199254740992
  GROUP BY trace_id
  HAVING last_ts < {now: DateTime64(3)} - toIntervalMillisecond({idleMs: UInt32})
      ORDER BY cityHash64(trace_id, {seed: String}), trace_id
      LIMIT {limit: UInt32}
```

- `order = "latest"` (snapshot) uses `ORDER BY last_ts DESC, trace_id`. The SHA256 sampling line appears only when `sampling < 1` (never for snapshots).
- Params: `limit` 100-500 (rule setup) or ≤ 1,000 (snapshot); `sampling` 0.01-1; `seed` = rule id or execution id.
- Settings: `max_execution_time = 30`. Service: `EventsReadOnly`.

## Q31: `getTopicSetupTraceBounds`

- Code: `topic-setup-events.ts:153-195`. Route tag `topics-setup-trace-bounds`.
- Callers: `ruleSetup.ts:250` and `snapshotSetup.ts:160`, once after Q30 with its trace ids (skipped when empty).

```sql
      SELECT
        trace_id,
        toUnixTimestamp64Milli(min(start_time)) AS min_start,
        toUnixTimestamp64Milli(max(start_time)) AS max_start,
        sum(event_bytes) AS event_bytes
      FROM events_core
      WHERE project_id = {projectId: String}
        AND start_time >= {from: DateTime64(3)} - INTERVAL 2 DAY
        AND trace_id IN {traceIds: Array(String)}
        AND is_deleted = 0
      GROUP BY trace_id
```

- Params: `traceIds` up to 500 / 1,000; `from` = setup window start or snapshot range start. No upper time bound.
- Settings: `max_execution_time = 30`. Service: `EventsReadOnly`.

## Q32: `getTopicSetupTraceNames`

- Code: `topic-setup-events.ts:202-228`. Route tag `topics-setup-trace-names`.
- Caller: `topicsRouter.ts:578` (tRPC `topics.setupTraceNames`): setup dialog trace-name picker, per load.

```sql
      SELECT trace_name AS name, uniq(trace_id) AS count
      FROM events_core
      WHERE project_id = {projectId: String}
        AND start_time >= {now: DateTime64(3)} - INTERVAL 7 DAY
        AND trace_name != ''
        AND is_deleted = 0
      GROUP BY trace_name
      ORDER BY count DESC, name
      LIMIT 100
```

- Settings: `max_execution_time = 10`. Service: `EventsReadOnly`.

## Q33: trace deletion, bounds lookup

- Code: `worker/src/features/traces/processClickhouseTraceDelete.ts:18-67` (`deleteTopicResultsForTraces`), called from `processClickhouseTraceDelete` (:242) for every trace-delete job. Runs for `topic_facet_summaries` and `topic_assignments` in parallel.

```sql
SELECT min(unit_start_time) AS min_timestamp,
            max(unit_start_time) AS max_timestamp, count() AS count
          FROM topic_facet_summaries
          WHERE project_id = {projectId: String}
            AND trace_id IN ({traceIds: Array(String)})
```

(and the same against `topic_assignments`).

- Params: `traceIds` = the job's trace ids (1 to thousands). No time bound: summaries rely on the `latest_source_versions` projection, assignments on `idx_trace_id`.
- Options: `request_timeout = LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS`; tags `{ projectId }` only (no route). Service: default.

## Q34: trace deletion, DELETE

- Same function, :46-64. Skipped for a table when Q33 counts 0.

```sql
DELETE FROM topic_facet_summaries
          WHERE project_id = {projectId: String}
            AND trace_id IN ({traceIds: Array(String)})
            AND unit_start_time >= {minTimestamp: DateTime64(3)}
            AND unit_start_time <= {maxTimestamp: DateTime64(3)}
```

(and `DELETE FROM topic_assignments ...` with the same shape).

- Settings: `lightweight_delete_mode = 'alter_update'` for `topic_facet_summaries` only (patch parts would disable the projection); `topic_assignments` uses the client default (`CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE` / `CLICKHOUSE_UPDATE_PARALLEL_MODE` env). `request_timeout = LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS`. Via `commandClickhouse`.

## Q35: project deletion, count

- Code: `worker/src/features/batch-project-cleaner/index.ts:282-312`, one `BatchProjectCleaner` per table in `BATCH_DELETION_TABLES` (:9-19), including `topic_facet_summaries`, `topic_assignments`, `topics`. Route tag `batch-project-cleaner/<table>/count`. Enabled by `LANGFUSE_BATCH_PROJECT_CLEANER_ENABLED`.
- Frequency: every 10 min after work, 1 h when empty; one count query across all tables at a time (Redis lock); rerun after a failed DELETE.

```sql
      SELECT project_id, count() as count
      FROM topic_facet_summaries
      WHERE project_id IN ({projectIds: Array(String)})
      GROUP BY project_id
      ORDER BY count DESC
```

(same for `topic_assignments` and `topics`).

- Params: `projectIds` = soft-deleted projects, up to 1,000. Settings: none. Service: default.

## Q36: project deletion, DELETE

- Code: `batch-project-cleaner/index.ts:314-336`.

```sql
      DELETE FROM topic_facet_summaries
      WHERE project_id IN ({projectIds: Array(String)})
```

(same for `topic_assignments` and `topics`).

- Settings: `lightweight_delete_mode = 'alter_update'` for `topic_facet_summaries` only. `request_timeout = LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS` (default 1 h). Via `commandClickhouse`.

---

## Appendix A: adjacent event reads (not counted)

These read events for Topics but do not touch the Topics tables or the events_core selection paths in scope. Listed so a replay plan can decide whether to include them.

- A1, A2: `loadTopicTranscript` (`packages/shared/src/server/topics/trace-input.ts:42-186`), called only by `web/src/features/events/server/eventsRouter.ts:635` (internal-only Topics transcript view). A1 is a bounds query on `events_full` (`forceFullTable`): `SELECT count() AS count, min(toUnixTimestamp64Milli(e.start_time)) AS minStart, max(toUnixTimestamp64Milli(e.start_time)) AS maxStart FROM events_full e WHERE e.project_id = {projectId: String} AND e.trace_id = {traceId: String} AND xxHash32(e.trace_id) = xxHash32({traceId: String}) [AND e.start_time >= {fromTimestamp: DateTime64(3)}]` (EventsReadOnly, `max_threads = 2`, `max_execution_time = 30`). A2 streams the trace's observations from `events_full` with full input/output and expanded metadata, `ORDER BY e.event_ts DESC, e.span_id DESC, e.environment DESC, cityHash64(...) DESC LIMIT 1 BY e.span_id, e.project_id LIMIT {limit: Int32}` (2,001), EventsReadOnly, `max_threads = 2`, `max_execution_time = 30`, `max_result_bytes = 10485760`, overflow modes `throw`.
- A3: `getTraceBatchEventStream` (`packages/shared/src/server/repositories/trace-batch.ts:212-251`), the events-dispatch read that builds the transcript Topics summarizes. Multi-project `events_full` read by trace id lists, pairs, xxHash32 and per-group time windows, EventsReadOnly, `max_threads = 2`, `max_execution_time = 30`. Generic dispatch pipeline, not Topics-specific SQL.
