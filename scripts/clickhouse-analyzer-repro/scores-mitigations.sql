-- Each query must succeed on an affected build. The first setting is the
-- narrowest robust mitigation because it disables only the optimization that
-- introduced this plan shape.

SELECT 'query_plan_top_k_through_join=0' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS query_plan_top_k_through_join = 0;

SELECT 'query_plan_max_limit_for_lazy_materialization=4' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS query_plan_max_limit_for_lazy_materialization = 4;

SELECT 'query_plan_filter_push_down=0' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS query_plan_filter_push_down = 0;

SELECT 'query_plan_optimize_lazy_materialization=0' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS query_plan_optimize_lazy_materialization = 0;

SELECT 'query_plan_enable_optimizations=0' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS query_plan_enable_optimizations = 0;

SELECT 'enable_analyzer=0' AS mitigation;
SELECT l.id, r.user_id
FROM scores_repro_left AS l FINAL
LEFT JOIN scores_repro_right AS r ON l.trace_id = r.id
WHERE l.project_id = 2
ORDER BY l.id DESC
LIMIT 5
SETTINGS enable_analyzer = 0;
