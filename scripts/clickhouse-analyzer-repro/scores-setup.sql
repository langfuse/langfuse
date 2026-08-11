-- Setup for the FINAL + LEFT JOIN + top-K/lazy-materialization repro.
-- The query is data-independent, but one part must exist to build the failing
-- ReadFromMergeTree plan.

DROP TABLE IF EXISTS scores_repro_right;
DROP TABLE IF EXISTS scores_repro_left;

CREATE TABLE scores_repro_left
(
    id UInt64,
    project_id UInt64,
    trace_id UInt64
)
ENGINE = ReplacingMergeTree
ORDER BY (project_id, id);

CREATE TABLE scores_repro_right
(
    id UInt64,
    user_id UInt64
)
ENGINE = MergeTree
ORDER BY id;

INSERT INTO scores_repro_left VALUES (1, 1, 1);
