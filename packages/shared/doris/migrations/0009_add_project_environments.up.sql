-- Create the project_environments 
-- todo : query this table in packages/shared/src/server/repositories/environments.ts 
-- should rewrite the SQL
CREATE TABLE project_environments (
    `project_id` varchar(50),
    `environments` Array<String>
) ENGINE=OLAP
DUPLICATE KEY(project_id)
DISTRIBUTED BY HASH(project_id) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 1"
);