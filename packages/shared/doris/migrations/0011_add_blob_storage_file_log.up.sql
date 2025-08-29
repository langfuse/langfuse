CREATE TABLE blob_storage_file_log
(
    `project_id`  varchar(65533),
    `entity_type` varchar(65533),
    `entity_id`   varchar(65533),
    `event_id`    varchar(65533),
    `event_ts`    Datetime(3),
    `is_deleted`  int,
    `id`          String,
    `bucket_name` String,
    `bucket_path` String,

    `created_at`  DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DateTime DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
UNIQUE KEY(project_id,entity_type,entity_id,event_id)
DISTRIBUTED BY HASH(project_id,entity_type,entity_id,event_id) BUCKETS auto
PROPERTIES (
"replication_allocation" = "tag.location.default: 1"
);
