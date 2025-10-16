# Event Backfill Validation Queries - Consolidated Edition

## Query 1: Coverage & Count Validation

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
          and e.source = 'ingestion-api'
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

## Query 2: Field Mapping Validation

```sql

WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-14 13:00:00') AS min_time,
            toDateTime('2025-10-14 14:45:00') AS max_time
    ),

    sampled_projects AS (
        SELECT project_id
        FROM observations o
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
        ORDER BY rand()
        LIMIT 100
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
        ON o.id = e.span_id AND o.project_id = e.project_id
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
          and e.start_time >= (SELECT min_time FROM time_range)
          and e.start_time <= (SELECT max_time FROM time_range)
          and o.project_id in (select project_id from sampled_projects)
          and e.source = 'ingestion-api'
    )

-- Identifier mismatches
SELECT
    'IDENTIFIER_MAPPINGS' AS validation_category,
    'parent_span_id_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    coalesce(parent_observation_id, trace_id) AS obs_value,
    e_parent_span_id AS event_value
FROM obs_event_joined
WHERE e_parent_span_id != coalesce(parent_observation_id, trace_id)

UNION ALL

SELECT
    'IDENTIFIER_MAPPINGS' AS validation_category,
    'trace_id_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    trace_id AS obs_value,
    e_trace_id AS event_value
FROM obs_event_joined
WHERE e_trace_id != trace_id

-- Timestamp mismatches
UNION ALL

SELECT
    'TIMESTAMP_MAPPINGS' AS validation_category,
    'start_time_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    toString(o_start_time) AS obs_value,
    toString(e_start_time) AS event_value
FROM obs_event_joined
WHERE toStartOfInterval(o_start_time, INTERVAL 1 SECOND) != toStartOfInterval(e_start_time, INTERVAL 1 SECOND)

UNION ALL

SELECT
    'TIMESTAMP_MAPPINGS' AS validation_category,
    'end_time_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    toString(o_end_time) AS obs_value,
    toString(e_end_time) AS event_value
FROM obs_event_joined
WHERE o_end_time IS NOT NULL
  AND e_end_time IS NOT NULL
  AND toStartOfInterval(o_end_time, INTERVAL 1 SECOND) != toStartOfInterval(e_end_time, INTERVAL 1 SECOND)

UNION ALL

SELECT
    'TIMESTAMP_MAPPINGS' AS validation_category,
    'end_time_null_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    'NULL' AS obs_value,
    toString(e_end_time) AS event_value
FROM obs_event_joined
WHERE o_end_time IS NULL AND e_end_time IS NOT NULL

-- Core string field mismatches
UNION ALL

SELECT
    'CORE_STRING_FIELDS' AS validation_category,
    'name_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_name AS obs_value,
    e_name AS event_value
FROM obs_event_joined
WHERE o_name != e_name

UNION ALL

SELECT
    'CORE_STRING_FIELDS' AS validation_category,
    'type_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_type AS obs_value,
    e_type AS event_value
FROM obs_event_joined
WHERE o_type != e_type

UNION ALL

SELECT
    'CORE_STRING_FIELDS' AS validation_category,
    'level_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_level AS obs_value,
    e_level AS event_value
FROM obs_event_joined
WHERE o_level != e_level

-- Nullable string field mismatches
UNION ALL

SELECT
    'NULLABLE_STRING_FIELDS' AS validation_category,
    'status_message_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    coalesce(o_status_message, '') AS obs_value,
    e_status_message AS event_value
FROM obs_event_joined
WHERE coalesce(o_status_message, '') != e_status_message

UNION ALL

SELECT
    'NULLABLE_STRING_FIELDS' AS validation_category,
    'version_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    coalesce(o_version, '') AS obs_value,
    coalesce(e_version, '') AS event_value
FROM obs_event_joined
WHERE coalesce(o_version, '') != coalesce(e_version, '')

UNION ALL

SELECT
    'NULLABLE_STRING_FIELDS' AS validation_category,
    'environment_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_environment AS obs_value,
    e_environment AS event_value
FROM obs_event_joined
WHERE o_environment != e_environment

UNION ALL

SELECT
    'INPUT_OUTPUT_FIELDS' AS validation_category,
    'input_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_input AS obs_value,
    e_input AS event_value
FROM obs_event_joined
WHERE o_input != e_input

UNION ALL

SELECT
    'INPUT_OUTPUT_FIELDS' AS validation_category,
    'output_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    o_output AS obs_value,
    e_output AS event_value
FROM obs_event_joined
WHERE o_output != e_output

-- ORDER BY validation_category, issue_type, observation_id
SETTINGS join_algorithm = 'partial_merge'
```

## [WIP] Query 3: Trace Join & User/Session/Metadata Propagation

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-14 13:00:00') AS min_time,
            toDateTime('2025-10-14 14:45:00') AS max_time
    ),

    sampled_projects AS (
        SELECT project_id
        FROM observations o
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
        ORDER BY rand()
        LIMIT 100
    ),

    -- Join observations, events, and traces
    full_join AS (
        SELECT
            o.id,
            o.project_id,
            o.trace_id,
            o.metadata AS o_metadata,
            t.user_id AS t_user_id,
            t.session_id AS t_session_id,
            t.metadata AS t_metadata,
            e.user_id AS e_user_id,
            e.session_id AS e_session_id,
            e.metadata AS e_metadata,
            t.id IS NOT NULL AS trace_exists
        FROM observations o
        INNER JOIN events e
            ON o.id = e.span_id
            AND o.project_id = e.project_id
        LEFT JOIN traces t
            ON o.trace_id = t.id
            AND o.project_id = t.project_id
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
          AND e.start_time >= (SELECT min_time FROM time_range)
          AND e.start_time <= (SELECT max_time FROM time_range)
          AND o.project_id IN (SELECT project_id FROM sampled_projects)
          AND e.source = 'ingestion-api'
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
FROM full_join

UNION ALL

-- Metadata validation: observation metadata preserved
SELECT
    'OBS_METADATA_PRESERVED' AS scenario,
    countIf(trace_exists AND mapSize(o_metadata) > 0) AS total_with_obs_metadata,
    countIf(
        trace_exists AND mapSize(o_metadata) > 0 AND
        arrayAll(
            key -> mapContains(e_metadata, key) AND e_metadata[key] = o_metadata[key],
            mapKeys(o_metadata)
        )
    ) AS correctly_preserved,
    countIf(
        trace_exists AND mapSize(o_metadata) > 0 AND NOT
        arrayAll(
            key -> mapContains(e_metadata, key) AND e_metadata[key] = o_metadata[key],
            mapKeys(o_metadata)
        )
    ) AS preservation_failures,
    0 AS unused_column,
    CASE
        WHEN countIf(
            trace_exists AND mapSize(o_metadata) > 0 AND NOT
            arrayAll(
                key -> mapContains(e_metadata, key) AND e_metadata[key] = o_metadata[key],
                mapKeys(o_metadata)
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM full_join

UNION ALL

-- Metadata validation: trace metadata merged (for keys not in observation metadata)
SELECT
    'TRACE_METADATA_MERGED' AS scenario,
    countIf(
        trace_exists AND mapSize(t_metadata) > 0 AND
        length(arrayFilter(k -> NOT mapContains(o_metadata, k), mapKeys(t_metadata))) > 0
    ) AS total_with_trace_only_keys,
    countIf(
        trace_exists AND mapSize(t_metadata) > 0 AND
        arrayAll(
            key -> mapContains(e_metadata, key) AND e_metadata[key] = t_metadata[key],
            arrayFilter(k -> NOT mapContains(o_metadata, k), mapKeys(t_metadata))
        )
    ) AS correctly_merged,
    countIf(
        trace_exists AND mapSize(t_metadata) > 0 AND NOT
        arrayAll(
            key -> mapContains(e_metadata, key) AND e_metadata[key] = t_metadata[key],
            arrayFilter(k -> NOT mapContains(o_metadata, k), mapKeys(t_metadata))
        )
    ) AS merge_failures,
    0 AS unused_column,
    CASE
        WHEN countIf(
            trace_exists AND mapSize(t_metadata) > 0 AND NOT
            arrayAll(
                key -> mapContains(e_metadata, key) AND e_metadata[key] = t_metadata[key],
                arrayFilter(k -> NOT mapContains(o_metadata, k), mapKeys(t_metadata))
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM full_join

UNION ALL

-- Metadata validation: observation metadata takes precedence over trace metadata for conflicting keys
SELECT
    'OBS_PRECEDENCE_OVER_TRACE' AS scenario,
    countIf(
        trace_exists AND
        length(arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))) > 0
    ) AS records_with_conflicts,
    countIf(
        trace_exists AND
        length(arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))) > 0 AND
        arrayAll(
            key -> e_metadata[key] = o_metadata[key],
            arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))
        )
    ) AS obs_precedence_correct,
    countIf(
        trace_exists AND
        length(arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))) > 0 AND NOT
        arrayAll(
            key -> e_metadata[key] = o_metadata[key],
            arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))
        )
    ) AS precedence_violations,
    0 AS unused_column,
    CASE
        WHEN countIf(
            trace_exists AND
            length(arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))) > 0 AND NOT
            arrayAll(
                key -> e_metadata[key] = o_metadata[key],
                arrayIntersect(mapKeys(o_metadata), mapKeys(t_metadata))
            )
        ) = 0 THEN '✓ PASS'
        ELSE '✗ FAIL'
    END AS status
FROM full_join;
```

## [WIP] Query 4: Metadata Merging Validation

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
