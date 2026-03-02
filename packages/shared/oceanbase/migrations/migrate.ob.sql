DROP TABLE IF EXISTS `blob_storage_file_log`;
CREATE TABLE `blob_storage_file_log` (
    `id` VARCHAR(255) NOT NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `entity_type` VARCHAR(255) NOT NULL,
    `entity_id` VARCHAR(255) NOT NULL,
    `event_id` VARCHAR(255) NOT NULL,
    `bucket_name` VARCHAR(255) NOT NULL,
    `bucket_path` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `event_ts` DATETIME(3) NOT NULL,
    `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    
    PRIMARY KEY (`project_id`, `entity_type`, `entity_id`, `event_id`, `event_ts`),
    INDEX `idx_project_entity` (`project_id`, `entity_type`, `entity_id`),
    INDEX `idx_event_ts` (`event_ts`),
    INDEX `idx_is_deleted` (`is_deleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`event_ts`)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p202405 VALUES LESS THAN (TO_DAYS('2024-06-01')),
    PARTITION p202406 VALUES LESS THAN (TO_DAYS('2024-07-01')),
    PARTITION p202407 VALUES LESS THAN (TO_DAYS('2024-08-01')),
    PARTITION p202408 VALUES LESS THAN (TO_DAYS('2024-09-01')),
    PARTITION p202409 VALUES LESS THAN (TO_DAYS('2024-10-01')),
    PARTITION p202410 VALUES LESS THAN (TO_DAYS('2024-11-01')),
    PARTITION p202411 VALUES LESS THAN (TO_DAYS('2024-12-01')),
    PARTITION p202412 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);

DROP TABLE IF EXISTS `dataset_run_items_rmt`;
CREATE TABLE `dataset_run_items_rmt` (
    `id` VARCHAR(255) NOT NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `dataset_run_id` VARCHAR(255) NOT NULL,
    `dataset_item_id` VARCHAR(255) NOT NULL,
    `dataset_id` VARCHAR(255) NOT NULL,
    `trace_id` VARCHAR(255) NOT NULL,
    `observation_id` VARCHAR(255) NULL,
    `error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `dataset_run_name` VARCHAR(255) NOT NULL,
    `dataset_run_description` TEXT NULL,
    `dataset_run_metadata` JSON NULL COMMENT 'Map(LowCardinality(String), String)',
    `dataset_run_created_at` DATETIME(3) NOT NULL,
    `dataset_item_input` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `dataset_item_expected_output` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `dataset_item_metadata` JSON NULL COMMENT 'Map(LowCardinality(String), String)',
    `dataset_item_version` DATETIME(3) NULL COMMENT 'Nullable(DateTime64(3)) in ClickHouse',
    `event_ts` DATETIME(3) NOT NULL,
    `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Primary key includes event_ts to support ReplacingMergeTree deduplication
    PRIMARY KEY (`project_id`, `dataset_id`, `dataset_run_id`, `id`, `event_ts`),
    
    -- Indexes replacing bloom_filter indexes
    INDEX `idx_dataset_item` (`dataset_item_id`),
    INDEX `idx_trace_id` (`trace_id`),
    
    -- Additional indexes for common query patterns
    INDEX `idx_project_dataset_run` (`project_id`, `dataset_id`, `dataset_run_id`),
    INDEX `idx_project_dataset_item` (`project_id`, `dataset_id`, `dataset_item_id`),
    INDEX `idx_event_ts` (`event_ts`),
    INDEX `idx_is_deleted` (`is_deleted`),
    INDEX `idx_dataset_run_created_at` (`dataset_run_created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `event_log`;
CREATE TABLE `event_log` (
    `id` VARCHAR(255) NOT NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `entity_type` VARCHAR(255) NOT NULL,
    `entity_id` VARCHAR(255) NOT NULL,
    `event_id` VARCHAR(255) NULL,
    `bucket_name` VARCHAR(255) NOT NULL,
    `bucket_path` VARCHAR(255) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    
    -- Primary key matches ClickHouse ORDER BY clause
    PRIMARY KEY (`project_id`, `entity_type`, `entity_id`, `id`),
    
    -- Indexes for common query patterns
    INDEX `idx_project_entity` (`project_id`, `entity_type`, `entity_id`),
    INDEX `idx_event_id` (`event_id`),
    INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `observations`;
CREATE TABLE `observations` (
    `id` VARCHAR(255) NOT NULL,
    `trace_id` VARCHAR(255) NOT NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `environment` VARCHAR(50) NOT NULL DEFAULT 'default',
    `type` VARCHAR(50) NOT NULL,
    `parent_observation_id` VARCHAR(255) NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NULL,
    `name` VARCHAR(255) NOT NULL,
    `metadata` JSON NULL COMMENT 'Map(LowCardinality(String), String)',
    `level` VARCHAR(50) NULL,
    `status_message` TEXT NULL,
    `version` VARCHAR(255) NULL,
    `input` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `output` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `provided_model_name` VARCHAR(255) NULL,
    `internal_model_id` VARCHAR(255) NULL,
    `usage_pricing_tier_id` VARCHAR(255) NULL,
    `usage_pricing_tier_name` VARCHAR(255) NULL,
    `model_parameters` TEXT NULL,
    `tool_definitions` JSON NULL COMMENT 'Map(String, String)',
    `tool_calls` JSON NULL COMMENT 'Array(String)',
    `tool_call_names` JSON NULL COMMENT 'Array(String)',
    `provided_usage_details` JSON NULL COMMENT 'Map(LowCardinality(String), UInt64)',
    `usage_details` JSON NULL COMMENT 'Map(LowCardinality(String), UInt64)',
    `provided_cost_details` JSON NULL COMMENT 'Map(LowCardinality(String), Decimal(18,12))',
    `cost_details` JSON NULL COMMENT 'Map(LowCardinality(String), Decimal(18,12))',
    `total_cost` DECIMAL(18,12) NULL,
    `completion_start_time` DATETIME(3) NULL,
    `prompt_id` VARCHAR(255) NULL,
    `prompt_name` VARCHAR(255) NULL,
    `prompt_version` SMALLINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `event_ts` DATETIME(3) NOT NULL,
    `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Primary key includes event_ts to support ReplacingMergeTree deduplication
    -- Matches ClickHouse PRIMARY KEY: (project_id, type, toDate(start_time))
    PRIMARY KEY (`project_id`, `type`, `start_time`, `id`, `event_ts`),
    
    -- Indexes replacing bloom_filter indexes
    INDEX `idx_id` (`id`),
    INDEX `idx_trace_id` (`trace_id`),
    
    -- Additional indexes for common query patterns
    INDEX `idx_project_type_start` (`project_id`, `type`, `start_time`),
    INDEX `idx_parent_observation_id` (`parent_observation_id`),
    INDEX `idx_event_ts` (`event_ts`),
    INDEX `idx_is_deleted` (`is_deleted`),
    INDEX `idx_prompt_id` (`prompt_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`start_time`)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p202405 VALUES LESS THAN (TO_DAYS('2024-06-01')),
    PARTITION p202406 VALUES LESS THAN (TO_DAYS('2024-07-01')),
    PARTITION p202407 VALUES LESS THAN (TO_DAYS('2024-08-01')),
    PARTITION p202408 VALUES LESS THAN (TO_DAYS('2024-09-01')),
    PARTITION p202409 VALUES LESS THAN (TO_DAYS('2024-10-01')),
    PARTITION p202410 VALUES LESS THAN (TO_DAYS('2024-11-01')),
    PARTITION p202411 VALUES LESS THAN (TO_DAYS('2024-12-01')),
    PARTITION p202412 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);


DROP TABLE IF EXISTS `project_environments`;
-- 完整的表结构 + 触发器
CREATE TABLE `project_environments` (
    `project_id` VARCHAR(255) NOT NULL,
    `environments` JSON NOT NULL COMMENT 'Array of unique environment strings',
    
    PRIMARY KEY (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `schema_migrations`;
CREATE TABLE `schema_migrations` (
    `version` BIGINT NOT NULL,
    `dirty` TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT '0 = clean, 1 = dirty (migration failed)',
    `sequence` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT 'Auto-incrementing sequence number',
    
    PRIMARY KEY (`sequence`),
    INDEX `idx_version` (`version`),
    INDEX `idx_dirty` (`dirty`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `scores`;
CREATE TABLE `scores` (
    `id` VARCHAR(255) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `environment` VARCHAR(50) NOT NULL DEFAULT 'default',
    `trace_id` VARCHAR(255) NULL,
    `session_id` VARCHAR(255) NULL,
    `dataset_run_id` VARCHAR(255) NULL,
    `observation_id` VARCHAR(255) NULL,
    `name` VARCHAR(255) NOT NULL,
    `value` DOUBLE NOT NULL,
    `source` VARCHAR(255) NOT NULL,
    `comment` TEXT NULL COMMENT 'Compressed in ClickHouse (CODEC ZSTD(1))',
    `metadata` JSON NULL COMMENT 'Map(LowCardinality(String), String)',
    `author_user_id` VARCHAR(255) NULL,
    `config_id` VARCHAR(255) NULL,
    `data_type` VARCHAR(50) NOT NULL,
    `string_value` VARCHAR(255) NULL,
    `long_string_value` LONGTEXT NULL COMMENT 'CODEC(ZSTD(3)) in ClickHouse',
    `queue_id` VARCHAR(255) NULL,
    `execution_trace_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `event_ts` DATETIME(3) NOT NULL,
    `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Primary key includes event_ts to support ReplacingMergeTree deduplication
    -- Matches ClickHouse PRIMARY KEY: (project_id, toDate(timestamp), name)
    PRIMARY KEY (`project_id`, `timestamp`, `name`, `id`, `event_ts`),
    
    -- Indexes replacing bloom_filter indexes
    INDEX `idx_id` (`id`),
    INDEX `idx_project_trace_observation` (`project_id`, `trace_id`, `observation_id`),
    INDEX `idx_project_session` (`project_id`, `session_id`),
    INDEX `idx_project_dataset_run` (`project_id`, `dataset_run_id`),
    
    -- Additional indexes for common query patterns
    INDEX `idx_project_timestamp_name` (`project_id`, `timestamp`, `name`),
    INDEX `idx_event_ts` (`event_ts`),
    INDEX `idx_is_deleted` (`is_deleted`),
    INDEX `idx_name` (`name`),
    INDEX `idx_config_id` (`config_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`timestamp`)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p202405 VALUES LESS THAN (TO_DAYS('2024-06-01')),
    PARTITION p202406 VALUES LESS THAN (TO_DAYS('2024-07-01')),
    PARTITION p202407 VALUES LESS THAN (TO_DAYS('2024-08-01')),
    PARTITION p202408 VALUES LESS THAN (TO_DAYS('2024-09-01')),
    PARTITION p202409 VALUES LESS THAN (TO_DAYS('2024-10-01')),
    PARTITION p202410 VALUES LESS THAN (TO_DAYS('2024-11-01')),
    PARTITION p202411 VALUES LESS THAN (TO_DAYS('2024-12-01')),
    PARTITION p202412 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);

DROP TABLE IF EXISTS `traces`;
CREATE TABLE `traces` (
    `id` VARCHAR(255) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `user_id` VARCHAR(255) NULL,
    `metadata` JSON NULL COMMENT 'Map(LowCardinality(String), String)',
    `release` VARCHAR(255) NULL,
    `version` VARCHAR(255) NULL,
    `project_id` VARCHAR(255) NOT NULL,
    `environment` VARCHAR(50) NOT NULL DEFAULT 'default',
    `public` TINYINT(1) NOT NULL DEFAULT 0,
    `bookmarked` TINYINT(1) NOT NULL DEFAULT 0,
    `tags` JSON NULL COMMENT 'Array of strings stored as JSON',
    `input` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `output` LONGTEXT NULL COMMENT 'Compressed JSON in ClickHouse (CODEC ZSTD(3))',
    `session_id` VARCHAR(255) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    `event_ts` DATETIME(3) NOT NULL,
    `is_deleted` TINYINT UNSIGNED NOT NULL DEFAULT 0,
    
    -- Primary key includes event_ts to support ReplacingMergeTree deduplication
    -- Matches ClickHouse PRIMARY KEY: (project_id, toDate(timestamp))
    PRIMARY KEY (`project_id`, `timestamp`, `id`, `event_ts`),
    
    -- Indexes replacing bloom_filter indexes
    INDEX `idx_id` (`id`),
    INDEX `idx_session_id` (`session_id`),
    INDEX `idx_user_id` (`user_id`),
    
    -- Additional indexes for common query patterns
    INDEX `idx_project_timestamp` (`project_id`, `timestamp`),
    INDEX `idx_event_ts` (`event_ts`),
    INDEX `idx_is_deleted` (`is_deleted`),
    INDEX `idx_environment` (`environment`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
PARTITION BY RANGE (TO_DAYS(`timestamp`)) (
    PARTITION p202401 VALUES LESS THAN (TO_DAYS('2024-02-01')),
    PARTITION p202402 VALUES LESS THAN (TO_DAYS('2024-03-01')),
    PARTITION p202403 VALUES LESS THAN (TO_DAYS('2024-04-01')),
    PARTITION p202404 VALUES LESS THAN (TO_DAYS('2024-05-01')),
    PARTITION p202405 VALUES LESS THAN (TO_DAYS('2024-06-01')),
    PARTITION p202406 VALUES LESS THAN (TO_DAYS('2024-07-01')),
    PARTITION p202407 VALUES LESS THAN (TO_DAYS('2024-08-01')),
    PARTITION p202408 VALUES LESS THAN (TO_DAYS('2024-09-01')),
    PARTITION p202409 VALUES LESS THAN (TO_DAYS('2024-10-01')),
    PARTITION p202410 VALUES LESS THAN (TO_DAYS('2024-11-01')),
    PARTITION p202411 VALUES LESS THAN (TO_DAYS('2024-12-01')),
    PARTITION p202412 VALUES LESS THAN (TO_DAYS('2025-01-01')),
    PARTITION pmax VALUES LESS THAN MAXVALUE
);