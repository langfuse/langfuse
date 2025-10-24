# Event Backfill Validation Queries

## Query 1: Coverage & Count Validation

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-17 09:00:00') AS min_time,
            toDateTime('2025-10-17 13:45:00') AS max_time
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
        FROM events e
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
            toDateTime('2025-10-17 09:00:00') AS min_time,
            toDateTime('2025-10-17 13:45:00') AS max_time
    ),

    sampled_projects AS (
        SELECT project_id
        FROM observations o
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
        ORDER BY rand()
        LIMIT 10
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
            e.metadata_names AS e_metadata_names,
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
    
UNION ALL

SELECT
    'METADATA_FIELD' AS validation_category,
    'metadata_key_mismatch' AS issue_type,
    id AS observation_id,
    project_id,
    arrayStringConcat(mapKeys(o_metadata), ', ') AS obs_value,
    arrayStringConcat(e_metadata_names, ', ') AS event_value
FROM obs_event_joined
WHERE NOT arrayAll(k -> has(e_metadata_names, k), mapKeys(o_metadata))

-- ORDER BY validation_category, issue_type, observation_id
SETTINGS join_algorithm = 'partial_merge'
```

## Query 3: Trace Join & User/Session/Metadata Propagation

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-17 09:00:00') AS min_time,
            toDateTime('2025-10-17 13:45:00') AS max_time
    ),

    sampled_projects AS (
        SELECT project_id
        FROM observations o
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
        ORDER BY rand()
        LIMIT 10
    ),

    -- Join events and traces
    full_join AS (
        SELECT
            e.span_id as span_id,
            e.project_id as project_id,
            e.trace_id as trace_id,
            t.user_id AS t_user_id,
            t.session_id AS t_session_id,
            t.metadata AS t_metadata,
            e.user_id AS e_user_id,
            e.session_id AS e_session_id,
            e.metadata_names AS e_metadata_names
        FROM traces t
                 LEFT JOIN events e
                           ON e.trace_id = t.id
                               AND e.project_id = t.project_id
        WHERE e.start_time >= (SELECT min_time FROM time_range)
          AND e.start_time <= (SELECT max_time FROM time_range)
          AND t.timestamp >= (SELECT min_time FROM time_range)
          AND t.timestamp <= (SELECT max_time FROM time_range)
          and t.project_id IN (SELECT project_id FROM sampled_projects)
          and e.project_id IN (SELECT project_id FROM sampled_projects)
          AND e.source = 'ingestion-api'
    )

SELECT
    'user_id_mismatch' AS issue_type,
    span_id,
    project_id,
    t_user_id AS obs_value,
    e_user_id AS event_value
FROM full_join
WHERE t_user_id != e_user_id

UNION ALL

SELECT
    'session_id_mismatch' AS issue_type,
    span_id,
    project_id,
    t_session_id AS obs_value,
    e_session_id AS event_value
FROM full_join
WHERE t_session_id != e_session_id

UNION ALL

SELECT
    'metadata_keys_missing' AS issue_type,
    span_id,
    project_id,
    arrayStringConcat(mapKeys(t_metadata), ', ') AS obs_value,
    arrayStringConcat(e_metadata_names, ', ') AS event_value
FROM full_join
WHERE NOT arrayAll(k -> has(e_metadata_names, k), mapKeys(t_metadata))

    SETTINGS join_algorithm = 'partial_merge'
```

## Query 4: Root Span Validation

```sql
WITH
    -- Time range configuration
    time_range AS (
        SELECT
            toDateTime('2025-10-17 09:00:00') AS min_time,
            toDateTime('2025-10-17 13:45:00') AS max_time
    ),

    sampled_projects AS (
        SELECT project_id
        FROM observations o
        WHERE o.start_time >= (SELECT min_time FROM time_range)
          AND o.start_time <= (SELECT max_time FROM time_range)
        ORDER BY rand()
        LIMIT 10
    ),

    -- Join with events to find root spans
    root_span_check AS (
        SELECT
            t.project_id,
            t.id AS trace_id,
            t.name AS trace_name,
            e.span_id AS root_span_id,
            e.parent_span_id AS root_parent_span_id,
            e.name AS root_span_name
        FROM traces t
        LEFT JOIN events e
        ON t.project_id = e.project_id
           AND e.trace_id = t.id
           AND e.parent_span_id = ''
           AND e.start_time >= (SELECT min_time FROM time_range)
           AND e.start_time <= (SELECT max_time FROM time_range)
        WHERE t.project_id IN (SELECT project_id FROM sampled_projects)
          AND t.timestamp >= (SELECT min_time FROM time_range)
          AND t.timestamp <= (SELECT max_time FROM time_range)
          AND (e.source is NULL or e.source = 'ingestion-api')
    )

-- Missing root spans
SELECT
    'missing_root_span' AS issue_type,
    project_id,
    trace_id,
    trace_name AS expected_name,
    concat('t-', trace_id) AS expected_span_id,
    '' AS actual_value
FROM root_span_check
WHERE root_span_id IS NULL

UNION ALL

-- Root spans with non-null parent_span_id
SELECT
    'root_span_has_parent' AS issue_type,
    project_id,
    trace_id,
    trace_name AS expected_name,
    root_span_id AS expected_span_id,
    root_parent_span_id AS actual_value
FROM root_span_check
WHERE root_span_id IS NOT NULL
  AND root_parent_span_id != ''

UNION ALL

-- Root spans with name mismatch
SELECT
    'root_span_name_mismatch' AS issue_type,
    project_id,
    trace_id,
    trace_name AS expected_name,
    root_span_id AS expected_span_id,
    root_span_name AS actual_value
FROM root_span_check
WHERE root_span_id IS NOT NULL
  AND root_span_name != trace_name

SETTINGS join_algorithm = 'partial_merge'
```
