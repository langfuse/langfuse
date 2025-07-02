CREATE TABLE event_log
(
    `id`          varchar(65533),
    `project_id`  varchar(65533),
    `entity_type` String,
    `entity_id`   String,
    `event_id`    String,

    `bucket_name` String,
    `bucket_path` String,

    `created_at`  DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DateTime DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
DUPLICATE KEY(`id`, `project_id`)
DISTRIBUTED BY HASH(`project_id`) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 1"
);
