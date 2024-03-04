CREATE OR REPLACE VIEW trace_metrics_view AS
WITH observations_metrics AS (
    SELECT
        trace_id,
        project_id,
        EXTRACT(EPOCH FROM COALESCE(MAX(o.end_time), MAX(o.start_time))) - EXTRACT(EPOCH FROM MIN(o.start_time))::double precision AS duration
    FROM
        observations o
    GROUP BY
        project_id, trace_id
)
SELECT
    t.id,
    o.duration,
    t.timestamp,
    t.name,
    t.user_id,
    t.metadata,
    t.release,
    t.version,
    t.project_id,
    t.public,
    t.bookmarked,
    t.tags,
    t.input,
    t.output,
    t.session_id
FROM
    traces t
    LEFT JOIN observations_metrics o ON t.id = o.trace_id and t.project_id = o.project_id