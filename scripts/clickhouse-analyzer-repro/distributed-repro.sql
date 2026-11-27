-- Reproduces the class behind langfuse/langfuse#14431 and the upstream
-- ClickHouse issues #79916, #81631 and #97899.
--
-- The remote and initiator output headers are ordered differently. Positional
-- mapping then tries to put a UInt64 alias expression into cost_details.
-- Expected failure:
--   Code: 53 ... Unsupported types to CAST AS Map. Left type: UInt64 ...

SELECT version() AS clickhouse_version;

SELECT
    map('total', toDecimal128(1, 12)) AS cost_details,
    observation_count,
    raw_count,
    another_count,
    observation_count + 1 AS derived_count
FROM distributed_map_cast
ORDER BY sort_key ASC
LIMIT 1;
