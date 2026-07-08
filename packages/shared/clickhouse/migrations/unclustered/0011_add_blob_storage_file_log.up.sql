CREATE TABLE blob_storage_file_log
(
    `id`          String,
    `project_id`  String,
    `entity_type` String,
    `entity_id`   String,
    `event_id`    String,

    `bucket_name` String,
    `bucket_path` String,

    `created_at`  DateTime64(3) DEFAULT now(),
    `updated_at`  DateTime64(3) DEFAULT now(),
    event_ts DateTime64(3),
    is_deleted UInt8,
) ENGINE = ReplacingMergeTree(event_ts, is_deleted)
      ORDER BY (
                project_id,
                entity_type,
                entity_id,
                event_id
          );
