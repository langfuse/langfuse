-- A per-query limit threshold is the least broad setting workaround when the
-- query limit is known. Disabling lazy materialization is the robust fallback.

SELECT 'query_plan_max_limit_for_lazy_materialization=4' AS mitigation;
SELECT lazy
FROM patch_parts_repro
WHERE filt > 0
ORDER BY id
LIMIT 5
SETTINGS query_plan_max_limit_for_lazy_materialization = 4;

SELECT 'query_plan_optimize_lazy_materialization=0' AS mitigation;
SELECT lazy
FROM patch_parts_repro
WHERE filt > 0
ORDER BY id
LIMIT 5
SETTINGS query_plan_optimize_lazy_materialization = 0;

SELECT 'enable_analyzer=0' AS mitigation;
SELECT lazy
FROM patch_parts_repro
WHERE filt > 0
ORDER BY id
LIMIT 5
SETTINGS enable_analyzer = 0;
