-- The second shard has the same schema and deliberately remains empty.

DROP TABLE IF EXISTS distributed_map_cast_local;

CREATE TABLE distributed_map_cast_local
(
    sort_key Int32,
    raw_count UInt64,
    observation_count UInt64 ALIAS raw_count + 1,
    another_count UInt64 ALIAS raw_count + 2
)
ENGINE = MergeTree
ORDER BY sort_key;
