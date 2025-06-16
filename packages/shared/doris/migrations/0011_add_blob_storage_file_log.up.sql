CREATE TABLE blob_storage_file_log
(
    event_ts DateTime,
    is_deleted int,
    `id`          String,
    `project_id`  String,
    `entity_type` String,
    `entity_id`   String,
    `event_id`    String,

    `bucket_name` String,
    `bucket_path` String,

    `created_at`  DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at`  DateTime DEFAULT CURRENT_TIMESTAMP
) ENGINE=OLAP
UNIQUE KEY(event_ts, is_deleted)
DISTRIBUTED BY HASH(event_ts) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 3"
);
