-- Setup for the initiator/data shard of the Distributed analyzer repro.

DROP TABLE IF EXISTS distributed_map_cast;
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

CREATE TABLE distributed_map_cast AS distributed_map_cast_local
ENGINE = Distributed(
    repro_cluster,
    currentDatabase(),
    distributed_map_cast_local,
    rand()
);

INSERT INTO distributed_map_cast_local VALUES (10, 41), (20, 99);
