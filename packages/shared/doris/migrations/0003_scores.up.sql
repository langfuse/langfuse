CREATE TABLE scores (
    `project_id` varchar(65533) not null,
    `timestamp_date` Date not null,
    `name` varchar(65533),
    `id` varchar(65533),
    `timestamp` DateTime(3),
    `trace_id` varchar(65533),
    `session_id` varchar(65533),
    `observation_id` varchar(65533),
    `value` Float,
    `source` String,
    metadata Map<String, String>,
    `comment` String,
    `author_user_id` String,
    `config_id` String,
    `data_type` String,
    `string_value` String,
    `queue_id` String,
    `created_at` DateTime(3) DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DateTime(3) DEFAULT CURRENT_TIMESTAMP(3),
    event_ts DateTime,
    `is_deleted` int,
    environment string DEFAULT 'default',
    INDEX idx_id (`id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for id',
    INDEX idx_project_trace_project_id (`project_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for project_id',
    INDEX idx_project_trace_trace_id (`trace_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for trace_id',
    INDEX idx_project_trace_observation_id (`observation_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for observation_id'
) ENGINE=OLAP
UNIQUE KEY(`project_id`, `timestamp_date`, `name`,`id`)
AUTO PARTITION BY RANGE (date_trunc(`timestamp_date`, 'month')) ()
DISTRIBUTED BY HASH(project_id) BUCKETS 8
PROPERTIES (
"replication_allocation" = "tag.location.default: 1"
)
