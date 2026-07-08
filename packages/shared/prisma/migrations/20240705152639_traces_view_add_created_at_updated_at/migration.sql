-- Drop and create to be able to change columns, otherwise new t.* cols cannot be added

DROP VIEW IF EXISTS traces_view;
CREATE VIEW traces_view AS
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
    t.*,
    o.duration
FROM
    traces t
    LEFT JOIN observations_metrics o ON t.id = o.trace_id and t.project_id = o.project_id