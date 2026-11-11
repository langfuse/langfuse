-- Expected failure:
--   Code: 10 ... Not found column _block_number ...

SELECT version() AS clickhouse_version;

SELECT lazy
FROM patch_parts_repro
WHERE filt > 0
ORDER BY id
LIMIT 5;
