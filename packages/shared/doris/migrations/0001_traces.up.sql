CREATE TABLE traces (
    `project_id` varchar(50) not null,
    `timestamp_date` Date not null,
    `timestamp` DateTime not null,
    `id` String,
    `name` String,
    `user_id` String,
    `metadata`  Map<String, String>,
    `release` String,
    `version` String,
    `public` Boolean,
    `bookmarked` Boolean,
    `tags` ARRAY<String> ,
    `input` String,
    `output` String,
    `session_id` String,
    `created_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    `event_ts` DateTime,
    `is_deleted` Int,
    INDEX idx_id (`id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for id'
 ) ENGINE=OLAP
UNIQUE KEY(project_id, timestamp_date)
AUTO PARTITION BY RANGE (date_trunc(`timestamp_date`, 'month')) ()
DISTRIBUTED BY HASH(project_id) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 3"
);
