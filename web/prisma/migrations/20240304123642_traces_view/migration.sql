CREATE VIEW trace_duration_view AS
SELECT
    t.project_id,
    t.name,
    EXTRACT(EPOCH FROM COALESCE(MAX(o.end_time), MAX(o.start_time))) - EXTRACT(EPOCH FROM MIN(o.start_time))::double precision AS duration
FROM
    traces t
    LEFT JOIN observations o ON t.id = o.trace_id
group by t.project_id, t.name