CREATE VIEW trace_metrics_view AS
SELECT
    t.id,
    EXTRACT(EPOCH FROM COALESCE(MAX(o.end_time), MAX(o.start_time))) - EXTRACT(EPOCH FROM MIN(o.start_time))::double precision AS duration
FROM
    traces t
    LEFT JOIN observations o ON t.id = o.trace_id
group by t.project_id, t.id