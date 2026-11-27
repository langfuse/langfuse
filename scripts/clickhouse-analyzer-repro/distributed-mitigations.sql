-- There is no narrow optimizer flag for this class. Moving ORDER BY/LIMIT to
-- an outer query block avoids the broken mergeable-stage output header without
-- disabling unrelated optimizations.

SELECT 'outer ORDER BY query block' AS mitigation;
SELECT
    cost_details,
    observation_count,
    raw_count,
    another_count,
    derived_count
FROM
(
    SELECT
        map('total', toDecimal128(1, 12)) AS cost_details,
        observation_count,
        raw_count,
        another_count,
        observation_count + 1 AS derived_count,
        sort_key
    FROM distributed_map_cast
) AS result
ORDER BY sort_key ASC
LIMIT 1;

SELECT 'enable_analyzer=0' AS mitigation;
SELECT
    map('total', toDecimal128(1, 12)) AS cost_details,
    observation_count,
    raw_count,
    another_count,
    observation_count + 1 AS derived_count
FROM distributed_map_cast
ORDER BY sort_key ASC
LIMIT 1
SETTINGS enable_analyzer = 0;
