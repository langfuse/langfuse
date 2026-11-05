-- Setup for ClickHouse/ClickHouse#102904. Lightweight UPDATE creates patch
-- parts; OPTIMIZE keeps a deterministic post-merge read shape.

SET enable_lightweight_update = 1;

DROP TABLE IF EXISTS patch_parts_repro;

CREATE TABLE patch_parts_repro
(
    id UInt64,
    filt UInt64,
    lazy String
)
ENGINE = MergeTree
ORDER BY id
SETTINGS
    enable_block_number_column = 1,
    enable_block_offset_column = 1,
    apply_patches_on_merge = 0;

INSERT INTO patch_parts_repro
SELECT number, number % 10, repeat('a', number)
FROM numbers(100);

INSERT INTO patch_parts_repro
SELECT number + 100, number % 10, repeat('b', number + 100)
FROM numbers(100);

UPDATE patch_parts_repro
SET lazy = 'patched'
WHERE filt < 3;

OPTIMIZE TABLE patch_parts_repro FINAL;
