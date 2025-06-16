CREATE TABLE scores (
    `project_id` varchar(50) not null,
    `timestamp_date` Date not null,
    `name` varchar(50),
    `id` String,
    `timestamp` DateTime,
    `trace_id` String,
    `observation_id` String,
    `value` Float,
    `source` String,
    `comment` String,
    `author_user_id` String,
    `config_id` String,
    `data_type` String,
    `string_value` String,
    `queue_id` String,
    `created_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    event_ts DateTime,
    `is_deleted` int,
    INDEX idx_id (`id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for id',
    INDEX idx_project_trace_project_id (`project_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for project_id',
    INDEX idx_project_trace_trace_id (`trace_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for trace_id',
    INDEX idx_project_trace_observation_id (`observation_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for observation_id'
) ENGINE=OLAP
UNIQUE KEY(`project_id`, `timestamp_date`, `name`)
AUTO PARTITION BY RANGE (date_trunc(`timestamp_date`, 'month')) ()
DISTRIBUTED BY HASH(project_id) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 3"
)
