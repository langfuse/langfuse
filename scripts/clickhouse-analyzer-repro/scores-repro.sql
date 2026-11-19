-- Reproduces langfuse/langfuse#15125 and ClickHouse/ClickHouse#109210.
-- Expected failure:
--   Code: 10 ... NOT_FOUND_COLUMN_IN_BLOCK

SELECT version() AS clickhouse_version;

SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5;
