CREATE TABLE event_log
(
    `id`          String,
    `project_id`  String,
    `entity_type` String,
    `entity_id`   String,
    `event_id`    Nullable(String),

    `bucket_name` String,
    `bucket_path` String,

    `created_at`  DateTime64(3, 'UTC') DEFAULT now('UTC'),
    `updated_at`  DateTime64(3, 'UTC') DEFAULT now('UTC')
) ENGINE = MergeTree()
      ORDER BY (
                project_id,
                entity_type,
                entity_id
          );
