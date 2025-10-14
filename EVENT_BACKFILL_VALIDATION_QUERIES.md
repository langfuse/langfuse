# Event Backfill Validation Queries - Consolidated Edition

## Query 1: Coverage & Count Validation

**Purpose**: Verify that all observations have been backfilled to events, check coverage by project and time period, identify missing records.

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-14 13:00:00') AS min_time,
            toDateTime('2025-10-14 14:45:00') AS max_time
    ),

    -- Get filtered observations
    filtered_obs AS (
        SELECT *
        FROM observations
        WHERE start_time >= (SELECT min_time FROM time_range)
          AND start_time <= (SELECT max_time FROM time_range)
    ),

    -- Get filtered events
    filtered_events AS (
        SELECT *
        FROM events
        WHERE start_time >= (SELECT min_time FROM time_range)
          AND start_time <= (SELECT max_time FROM time_range)
    ),

    -- Overall counts
    overall_counts AS (
        SELECT
            'OVERALL' AS category,
            '' AS dimension,
            (SELECT count() FROM filtered_obs) AS obs_count,
            (SELECT count() FROM filtered_events) AS event_count,
            (SELECT count() FROM observations_batch_staging) AS staging_count
    ),

    -- Counts by project
    project_counts AS (
        SELECT
            'BY_PROJECT' AS category,
            o.project_id AS dimension,
            count() AS obs_count,
            countIf(e.span_id IS NOT NULL) AS event_count,
            0 AS staging_count
        FROM filtered_obs o
                 LEFT JOIN filtered_events e ON o.id = e.span_id AND o.project_id = e.project_id
        GROUP BY o.project_id
    )

SELECT
    category,
    dimension,
    obs_count,
    event_count,
    staging_count,
    obs_count - event_count AS missing_in_events,
    CASE
        WHEN obs_count > 0 THEN round((event_count / obs_count) * 100, 2)
        ELSE 0
        END AS coverage_pct,
    CASE
        WHEN category = 'OVERALL' AND staging_count + event_count >= obs_count * 0.99 THEN '✓ PASS'
        WHEN category != 'OVERALL' AND event_count >= obs_count * 0.99 THEN '✓ PASS'
        WHEN category != 'OVERALL' AND event_count >= obs_count * 0.95 THEN '⚠ WARN'
        ELSE '✗ FAIL'
        END AS status
FROM overall_counts
UNION ALL
SELECT category, dimension, obs_count, event_count, staging_count,
       obs_count - event_count,
       CASE WHEN obs_count > 0 THEN round((event_count / obs_count) * 100, 2) ELSE 0 END,
       CASE
           WHEN event_count >= obs_count * 0.99 THEN '✓ PASS'
           WHEN event_count >= obs_count * 0.95 THEN '⚠ WARN'
           ELSE '✗ FAIL'
           END
FROM project_counts
ORDER BY
    CASE category
        WHEN 'OVERALL' THEN 1
        WHEN 'BY_PROJECT' THEN 2
        END,
    7;
```

  Query id: 65ec16a5-6b9b-4bdc-8f47-fb877909389f

  ┌─category─┬─dimension─┬─obs_count─┬─event_count─┬─staging_count─┬─missing_in_events─┬─coverage_pct─┬─status─┐
1. │ OVERALL  │           │   4260411 │     4274723 │       1767629 │            -14312 │       100.34 │ ✓ PASS │
   └──────────┴───────────┴───────────┴─────────────┴───────────────┴───────────────────┴──────────────┴────────┘
   ┌─category───┬─dimension─────────────────┬─obs_count─┬─event_count─┬─staging_count─┬─missing_in_events─┬─coverage_pct─┬─status─┐
2. │ BY_PROJECT │ clwk3car20000fedm37xefkh6 │         3 │           3 │             0 │                 0 │          100 │ ✓ PASS │
3. │ BY_PROJECT │ cmfmhssfz00tgad0770abqyb6 │         2 │           2 │             0 │                 0 │          100 │ ✓ PASS │
4. │ BY_PROJECT │ cmdyfvwxn00cvad07ov2mtwyz │        14 │          14 │             0 │                 0 │          100 │ ✓ PASS │
5. │ BY_PROJECT │ cmckcuffc0760ad074fbora26 │      2957 │        2957 │             0 │                 0 │          100 │ ✓ PASS │
6. │ BY_PROJECT │ cmbgg86ip01xpad07mnof0x2m │      7017 │        7017 │             0 │                 0 │          100 │ ✓ PASS │
7. │ BY_PROJECT │ cmaxo5qcf01ecad08jadbczmk │       120 │         120 │             0 │                 0 │          100 │ ✓ PASS │
8. │ BY_PROJECT │ cm7vcwxqg00p2ad07pqye9yyg │       505 │         505 │             0 │                 0 │          100 │ ✓ PASS │
9. │ BY_PROJECT │ cm7t7oyjq005xad071dccgvmp │        11 │          11 │             0 │                 0 │          100 │ ✓ PASS │
10. │ BY_PROJECT │ cmgq3us1202ouad07uqfums3x │        10 │          10 │             0 │                 0 │          100 │ ✓ PASS │
11. │ BY_PROJECT │ cmg0opser08ijad07ttht9kcl │        87 │          87 │             0 │                 0 │          100 │ ✓ PASS │
12. │ BY_PROJECT │ cm9mfmnoi005kad07u25ijqrb │       154 │         154 │             0 │                 0 │          100 │ ✓ PASS │
13. │ BY_PROJECT │ cmgjg5f7c002iad072r6xut49 │        38 │          38 │             0 │                 0 │          100 │ ✓ PASS │
14. │ BY_PROJECT │ cmcvmedox00gkad078a95cunx │      1760 │        1760 │             0 │                 0 │          100 │ ✓ PASS │
15. │ BY_PROJECT │ cmd45znys0163ad06y2fsjuch │       170 │         170 │             0 │                 0 │          100 │ ✓ PASS │

---

## Query 2: Comprehensive Field Mapping Validation

**Purpose**: Validate ALL field mappings in a single query - identifiers, timestamps, core properties, model/prompt fields, usage/cost, I/O.

```sql
  WITH
      -- Time range configuration
      time_range AS (
          SELECT
              toDateTime('2025-10-14 13:00:00') AS min_time,
              toDateTime('2025-10-14 14:45:00') AS max_time
      ),

      -- Join observations with events
      obs_event_joined AS (
          SELECT
              o.id,
              o.project_id,
              o.trace_id,
              o.parent_observation_id,
              o.start_time AS o_start_time,
              o.end_time AS o_end_time,
              o.completion_start_time AS o_completion_start_time,
              o.name AS o_name,
              o.type AS o_type,
              o.environment AS o_environment,
              o.version AS o_version,
              o.level AS o_level,
              o.status_message AS o_status_message,
              o.input AS o_input,
              o.output AS o_output,
              o.metadata AS o_metadata,
              e.span_id AS e_span_id,
              e.parent_span_id AS e_parent_span_id,
              e.trace_id AS e_trace_id,
              e.start_time AS e_start_time,
              e.end_time AS e_end_time,
              e.completion_start_time AS e_completion_start_time,
              e.name AS e_name,
              e.type AS e_type,
              e.environment AS e_environment,
              e.version AS e_version,
              e.level AS e_level,
              e.status_message AS e_status_message,
              e.input AS e_input,
              e.output AS e_output
          FROM observations o
                   LEFT JOIN events e
                             ON o.id = e.span_id
                                 AND o.project_id = e.project_id
          WHERE o.start_time >= (SELECT min_time FROM time_range)
            AND o.start_time <= (SELECT max_time FROM time_range)
            and e.start_time >= (SELECT min_time FROM time_range)
            and e.start_time <= (SELECT max_time FROM time_range)
      )

  SELECT
      'IDENTIFIER_MAPPINGS' AS validation_category,
      count() AS total_compared,
      countIf(id != e_span_id) AS mismatch_1,
      countIf(e_parent_span_id != coalesce(parent_observation_id, trace_id)) AS mismatch_2,
      countIf(e_trace_id != trace_id) AS mismatch_3,
      CASE WHEN countIf(id != e_span_id) = 0 AND countIf(e_parent_span_id !=
                                                         coalesce(parent_observation_id, trace_id)) = 0 AND countIf(e_trace_id != trace_id)
               THEN '✓ PASS' ELSE '✗ FAIL' END AS status
  FROM obs_event_joined

  UNION ALL

  SELECT
      'TIMESTAMP_MAPPINGS' AS validation_category,
      count() AS total_compared,
      countIf(toUnixTimestamp64Milli(o_start_time) !=
              toUnixTimestamp64Milli(e_start_time)) AS mismatch_1,
      countIf(o_end_time IS NOT NULL AND e_end_time IS NOT NULL AND
              toUnixTimestamp64Milli(o_end_time) != toUnixTimestamp64Milli(e_end_time))
          AS mismatch_2,
      countIf(o_end_time IS NULL AND e_end_time IS NOT NULL) AS mismatch_3,
      CASE WHEN countIf(toUnixTimestamp64Milli(o_start_time) !=
                        toUnixTimestamp64Milli(e_start_time)) = 0
          AND countIf(o_end_time IS NOT NULL AND e_end_time IS NOT NULL
              AND toUnixTimestamp64Milli(o_end_time) !=
                  toUnixTimestamp64Milli(e_end_time)) = 0
          AND countIf(o_end_time IS NULL AND e_end_time IS NOT NULL) =
              0
               THEN '✓ PASS' ELSE '✗ FAIL' END AS status
  FROM obs_event_joined

  UNION ALL

  SELECT
      'CORE_STRING_FIELDS' AS validation_category,
      count() AS total_compared,
      countIf(o_name != e_name) AS mismatch_1,
      countIf(o_type != e_type) AS mismatch_2,
      countIf(o_level != e_level) AS mismatch_3,
      CASE WHEN countIf(o_name != e_name) = 0
          AND countIf(o_type != e_type) = 0
          AND countIf(o_level != e_level) = 0
               THEN '✓ PASS' ELSE '✗ FAIL' END AS status
  FROM obs_event_joined

  UNION ALL

  SELECT
      'NULLABLE_STRING_FIELDS' AS validation_category,
      count() AS total_compared,
      countIf(coalesce(o_status_message, '') != e_status_message) AS
                                  mismatch_1,
      countIf(coalesce(o_version, '') != coalesce(e_version, '')) AS
                                  mismatch_2,
      countIf(o_environment != e_environment) AS mismatch_3,
      CASE WHEN countIf(coalesce(o_status_message, '') != e_status_message) =
                0
          AND countIf(coalesce(o_version, '') != coalesce(e_version,
                                                          '')) = 0
          AND countIf(o_environment != e_environment) = 0
               THEN '✓ PASS' ELSE '✗ FAIL' END AS status
  FROM obs_event_joined

  --   UNION ALL

--   SELECT
--       'INPUT_OUTPUT_FIELDS' AS validation_category,
--       count() AS total_compared,
--       countIf(coalesce(o_input, '') != e_input) AS mismatch_1,
--       countIf(coalesce(o_output, '') != e_output) AS mismatch_2,
--       0 AS mismatch_3,
--       CASE WHEN countIf(coalesce(o_input, '') != e_input) = 0
--                 AND countIf(coalesce(o_output, '') != e_output) = 0
--            THEN '✓ PASS' ELSE '✗ FAIL' END AS status
--   FROM obs_event_joined
  ORDER BY validation_category
  SETTINGS join_algorithm = 'partial_merge'
```

Query id: 04ef9fd4-e29e-4124-b8be-8b051106ce55

┌─validation_category─┬─total_compared─┬─mismatch_1─┬─mismatch_2─┬─mismatch_3─┬─status─┐
1. │ TIMESTAMP_MAPPINGS  │        4273039 │       2186 │       2185 │      16221 │ ✗ FAIL │
   └─────────────────────┴────────────────┴────────────┴────────────┴────────────┴────────┘
   ┌─validation_category─┬─total_compared─┬─mismatch_1─┬─mismatch_2─┬─mismatch_3─┬─status─┐
2. │ CORE_STRING_FIELDS  │        4273039 │      91690 │        521 │         82 │ ✗ FAIL │
   └─────────────────────┴────────────────┴────────────┴────────────┴────────────┴────────┘
   ┌─validation_category─┬─total_compared─┬─mismatch_1─┬─mismatch_2─┬─mismatch_3─┬─status─┐
3. │ IDENTIFIER_MAPPINGS │        4273039 │          0 │        998 │       1767 │ ✗ FAIL │
   └─────────────────────┴────────────────┴────────────┴────────────┴────────────┴────────┘
   ┌─validation_category────┬─total_compared─┬─mismatch_1─┬─mismatch_2─┬─mismatch_3─┬─status─┐
4. │ NULLABLE_STRING_FIELDS │        4273039 │        299 │         11 │          0 │ ✗ FAIL │
   └────────────────────────┴────────────────┴────────────┴────────────┴────────────┴────────┘

## Query 3: Trace Join & User/Session Propagation

**Purpose**: Validate that user_id and session_id are correctly propagated from traces, and handle missing traces appropriately.

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('{min_time:2020-01-01 00:00:00}') AS min_time,
            toDateTime('{max_time:2099-12-31 23:59:59}') AS max_time
    ),

    -- Join observations, events, and traces
    full_join AS (
        SELECT
            o.id,
            o.project_id,
            o.trace_id,
            t.user_id AS t_user_id,
            t.session_id AS t_session_id,
            e.user_id AS e_user_id,
            e.session_id AS e_session_id,
            t.id IS NOT NULL AS trace_exists
        FROM observations FINAL o
        INNER JOIN events FINAL e
            ON o.id = e.span_id
            AND o.project_id = e.project_id
        LEFT JOIN traces FINAL t
            ON o.trace_id = t.id
            AND o.project_id = t.project_id
            AND t.is_deleted = 0
        WHERE o.is_deleted = 0
          AND e.is_deleted = 0
          AND e.source IN ('otel', 'ingestion-api')
          AND o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
    )

SELECT
    'WITH_TRACE_JOIN' AS scenario,
    countIf(trace_exists) AS total_with_trace,
    countIf(trace_exists AND t_user_id IS NOT NULL AND e_user_id != coalesce(t_user_id, '')) AS user_id_mismatch,
    countIf(trace_exists AND t_session_id IS NOT NULL AND e_session_id != coalesce(t_session_id, '')) AS session_id_mismatch,
    countIf(trace_exists AND t_user_id IS NULL AND e_user_id != '') AS user_id_should_be_empty,
    countIf(trace_exists AND t_session_id IS NULL AND e_session_id != '') AS session_id_should_be_empty,
    CASE
        WHEN countIf(trace_exists AND t_user_id IS NOT NULL AND e_user_id != coalesce(t_user_id, '')) = 0
             AND countIf(trace_exists AND t_session_id IS NOT NULL AND e_session_id != coalesce(t_session_id, '')) = 0
             AND countIf(trace_exists AND t_user_id IS NULL AND e_user_id != '') = 0
             AND countIf(trace_exists AND t_session_id IS NULL AND e_session_id != '') = 0
        THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM full_join

UNION ALL

SELECT
    'WITHOUT_TRACE_JOIN' AS scenario,
    countIf(NOT trace_exists) AS total_without_trace,
    countIf(NOT trace_exists AND e_user_id != '') AS user_id_not_empty,
    countIf(NOT trace_exists AND e_session_id != '') AS session_id_not_empty,
    0 AS user_id_should_be_empty,
    0 AS session_id_should_be_empty,
    CASE
        WHEN countIf(NOT trace_exists AND e_user_id != '') = 0
             AND countIf(NOT trace_exists AND e_session_id != '') = 0
        THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM full_join

UNION ALL

SELECT
    'MISSING_TRACES' AS scenario,
    countIf(NOT trace_exists) AS observations_without_trace,
    0 AS user_id_not_empty,
    0 AS session_id_not_empty,
    0 AS user_id_should_be_empty,
    0 AS session_id_should_be_empty,
    CASE
        WHEN (countIf(NOT trace_exists) * 100.0 / count()) < 1.0 THEN '✓ PASS'
        WHEN (countIf(NOT trace_exists) * 100.0 / count()) < 5.0 THEN '⚠ WARN'
        ELSE '✗ FAIL'
    END AS status
FROM full_join;
```

**Expected Results**:
- `WITH_TRACE_JOIN`: All mismatch counts should be 0
- `WITHOUT_TRACE_JOIN`: user_id and session_id should always be empty strings
- `MISSING_TRACES`: < 1% is normal, 1-5% is warning, > 5% requires investigation

## Query 4: Metadata Merging Validation

**Purpose**: Verify that metadata is correctly merged from observations and traces, with observation metadata taking precedence.

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('{min_time:2020-01-01 00:00:00}') AS min_time,
            toDateTime('{max_time:2099-12-31 23:59:59}') AS max_time
    ),

    -- Sample observations with both obs and trace metadata
    metadata_comparison AS (
        SELECT
            o.id,
            o.project_id,
            o.metadata AS obs_metadata,
            t.metadata AS trace_metadata,
            e.metadata AS event_metadata,
            arrayIntersect(mapKeys(o.metadata), mapKeys(t.metadata)) AS conflicting_keys,
            arrayFilter(k -> NOT mapContains(o.metadata, k), mapKeys(t.metadata)) AS trace_only_keys
        FROM observations FINAL o
        INNER JOIN events FINAL e
            ON o.id = e.span_id
            AND o.project_id = e.project_id
        INNER JOIN traces FINAL t
            ON o.trace_id = t.id
            AND o.project_id = t.project_id
        WHERE o.is_deleted = 0
          AND e.is_deleted = 0
          AND t.is_deleted = 0
          AND e.source IN ('otel', 'ingestion-api')
          AND o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
          AND (mapSize(o.metadata) > 0 OR mapSize(t.metadata) > 0)
    )

SELECT
    'OBS_METADATA_PRESERVED' AS validation_type,
    count() AS total_records,
    countIf(
        arrayAll(
            key -> mapContains(event_metadata, key) AND event_metadata[key] = obs_metadata[key],
            mapKeys(obs_metadata)
        )
    ) AS correctly_preserved,
    count() - countIf(
        arrayAll(
            key -> mapContains(event_metadata, key) AND event_metadata[key] = obs_metadata[key],
            mapKeys(obs_metadata)
        )
    ) AS preservation_failures,
    CASE
        WHEN count() - countIf(
            arrayAll(
                key -> mapContains(event_metadata, key) AND event_metadata[key] = obs_metadata[key],
                mapKeys(obs_metadata)
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM metadata_comparison

UNION ALL

SELECT
    'TRACE_METADATA_MERGED' AS validation_type,
    count() AS total_records,
    countIf(
        arrayAll(
            key -> mapContains(event_metadata, key) AND event_metadata[key] = trace_metadata[key],
            trace_only_keys
        )
    ) AS correctly_merged,
    count() - countIf(
        arrayAll(
            key -> mapContains(event_metadata, key) AND event_metadata[key] = trace_metadata[key],
            trace_only_keys
        )
    ) AS merge_failures,
    CASE
        WHEN count() - countIf(
            arrayAll(
                key -> mapContains(event_metadata, key) AND event_metadata[key] = trace_metadata[key],
                trace_only_keys
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM metadata_comparison
WHERE length(trace_only_keys) > 0

UNION ALL

SELECT
    'OBS_PRECEDENCE_OVER_TRACE' AS validation_type,
    countIf(length(conflicting_keys) > 0) AS records_with_conflicts,
    countIf(
        length(conflicting_keys) > 0 AND
        arrayAll(
            key -> event_metadata[key] = obs_metadata[key],
            conflicting_keys
        )
    ) AS obs_precedence_correct,
    countIf(
        length(conflicting_keys) > 0 AND NOT
        arrayAll(
            key -> event_metadata[key] = obs_metadata[key],
            conflicting_keys
        )
    ) AS precedence_violations,
    CASE
        WHEN countIf(
            length(conflicting_keys) > 0 AND NOT
            arrayAll(
                key -> event_metadata[key] = obs_metadata[key],
                conflicting_keys
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM metadata_comparison;
```
