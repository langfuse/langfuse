CREATE TABLE traces (
    `project_id` varchar(65533) not null,
    `timestamp_date` Date not null,
    `id` varchar(65533) not null,
    `timestamp` DateTime(3) not null,
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
    `created_at` DateTime(3) DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DateTime(3) DEFAULT CURRENT_TIMESTAMP(3),
    `event_ts` DateTime(3),
    `is_deleted` Int,
    `environment` String DEFAULT 'default',
    INDEX idx_id (`id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for id'
 ) ENGINE=OLAP
UNIQUE KEY(project_id, timestamp_date,id)
AUTO PARTITION BY RANGE (date_trunc(`timestamp_date`, 'month')) ()
DISTRIBUTED BY HASH(project_id) BUCKETS 8
PROPERTIES (
"replication_allocation" = "tag.location.default: 1"
);