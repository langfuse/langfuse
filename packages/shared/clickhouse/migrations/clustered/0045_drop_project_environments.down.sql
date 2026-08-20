-- WARNING: This recreates the table structure only. Any data held in
-- project_environments before the up migration dropped it is NOT restored,
-- and the materialized views that used to feed the table were already dropped
-- by 0027_drop_project_environments_mvs, so it stays empty.
CREATE TABLE IF NOT EXISTS project_environments ON CLUSTER default (
    `project_id` String,
    `environments` SimpleAggregateFunction(groupUniqArrayArray, Array(String))
) ENGINE = ReplicatedAggregatingMergeTree
ORDER BY (project_id);
