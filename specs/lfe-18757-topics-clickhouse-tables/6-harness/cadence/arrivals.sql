CREATE TABLE IF NOT EXISTS topics_schema_exp.arrivals (processed_at DateTime64(3, 'UTC'), p String, d Date, n UInt64, fk String, dup UInt8)
ENGINE = MergeTree ORDER BY processed_at;
