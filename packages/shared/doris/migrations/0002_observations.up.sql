CREATE TABLE observations (
    `project_id` varchar(50) not null,
    `type` varchar(20),
    `start_time_date` Date not null,
    `id` String,
    `trace_id` String,
    `parent_observation_id` String,
    `start_time` DateTime,
    `end_time` DateTime,
    `name` String,
    `metadata` Map<String, String>,
    `level` String,
    `status_message` String,
    `version` String,
    `input` String,
    `output` String,
    `provided_model_name` String,
    `internal_model_id` String,
    `model_parameters` String,
    `provided_usage_details` Map<String, Int>,
    `usage_details` Map<String, Int>,
    `provided_cost_details` Map<String, Decimal(38, 12)>,
    `cost_details` Map<String, Decimal(38, 12)>,
    `total_cost` Decimal(38, 12),
    `completion_start_time` DateTime,
    `prompt_id` String,
    `prompt_name` String,
    `prompt_version` int,
    `created_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DateTime DEFAULT CURRENT_TIMESTAMP,
    event_ts DateTime,
    is_deleted int,
    INDEX idx_id (`id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for id',
    INDEX idx_trace_id (`trace_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for trace_id',
    INDEX idx_project_id (`project_id`) USING INVERTED PROPERTIES("parser" = "english") COMMENT 'inverted index for project_id'
) ENGINE=OLAP
UNIQUE KEY(`project_id`, `type`, `start_time_date`)
AUTO PARTITION BY RANGE (date_trunc(`start_time_date`, 'month')) ()
DISTRIBUTED BY HASH(project_id) BUCKETS 64
PROPERTIES (
"replication_allocation" = "tag.location.default: 3"
);