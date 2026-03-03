-- CreateTable
CREATE TABLE IF NOT EXISTS `Account` (
    `id` VARCHAR(191) NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerAccountId` VARCHAR(191) NOT NULL,
    `refresh_token` VARCHAR(191) NULL,
    `access_token` VARCHAR(191) NULL,
    `expires_at` INTEGER NULL,
    `token_type` VARCHAR(191) NULL,
    `scope` VARCHAR(191) NULL,
    `id_token` VARCHAR(191) NULL,
    `session_state` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `expires_in` INTEGER NULL,
    `ext_expires_in` INTEGER NULL,
    `refresh_token_expires_in` INTEGER NULL,
    `created_at` INTEGER NULL,

    INDEX `Account_user_id_idx`(`user_id`),
    UNIQUE INDEX `Account_provider_providerAccountId_key`(`provider`, `providerAccountId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `actions` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `type` ENUM('WEBHOOK', 'SLACK', 'GITHUB_DISPATCH') NOT NULL,
    `config` JSON NOT NULL,

    INDEX `actions_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `annotation_queue_assignments` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `queue_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `annotation_queue_assignments_project_id_queue_id_user_id_key`(`project_id`, `queue_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `annotation_queue_items` (
    `id` VARCHAR(191) NOT NULL,
    `queue_id` VARCHAR(191) NOT NULL,
    `object_id` VARCHAR(191) NOT NULL,
    `object_type` ENUM('TRACE', 'OBSERVATION', 'SESSION') NOT NULL,
    `status` ENUM('PENDING', 'COMPLETED') NOT NULL DEFAULT 'PENDING',
    `locked_at` DATETIME(3) NULL,
    `locked_by_user_id` VARCHAR(191) NULL,
    `annotator_user_id` VARCHAR(191) NULL,
    `completed_at` DATETIME(3) NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `annotation_queue_items_annotator_user_id_idx`(`annotator_user_id`),
    INDEX `annotation_queue_items_created_at_idx`(`created_at`),
    INDEX `annotation_queue_items_id_project_id_idx`(`id`, `project_id`),
    INDEX `aq_items_obj_type_proj_queue_idx`(`object_id`, `object_type`, `project_id`, `queue_id`),
    INDEX `annotation_queue_items_project_id_queue_id_status_idx`(`project_id`, `queue_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `annotation_queues` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `score_config_ids` JSON NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `annotation_queues_id_project_id_idx`(`id`, `project_id`),
    INDEX `annotation_queues_project_id_created_at_idx`(`project_id`, `created_at`),
    UNIQUE INDEX `annotation_queues_project_id_name_key`(`project_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `note` VARCHAR(191) NULL,
    `public_key` VARCHAR(191) NOT NULL,
    `hashed_secret_key` VARCHAR(191) NOT NULL,
    `display_secret_key` VARCHAR(191) NOT NULL,
    `last_used_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `project_id` VARCHAR(191) NULL,
    `fast_hashed_secret_key` VARCHAR(191) NULL,
    `organization_id` VARCHAR(191) NULL,
    `scope` ENUM('ORGANIZATION', 'PROJECT') NOT NULL DEFAULT 'PROJECT',

    UNIQUE INDEX `api_keys_id_key`(`id`),
    UNIQUE INDEX `api_keys_public_key_key`(`public_key`),
    UNIQUE INDEX `api_keys_hashed_secret_key_key`(`hashed_secret_key`),
    UNIQUE INDEX `api_keys_fast_hashed_secret_key_key`(`fast_hashed_secret_key`),
    INDEX `api_keys_fast_hashed_secret_key_idx`(`fast_hashed_secret_key`),
    INDEX `api_keys_hashed_secret_key_idx`(`hashed_secret_key`),
    INDEX `api_keys_organization_id_idx`(`organization_id`),
    INDEX `api_keys_project_id_idx`(`project_id`),
    INDEX `api_keys_public_key_idx`(`public_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `user_id` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `resource_type` VARCHAR(191) NOT NULL,
    `resource_id` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `before` TEXT NULL,
    `after` TEXT NULL,
    `org_id` VARCHAR(191) NOT NULL,
    `user_org_role` VARCHAR(191) NULL,
    `user_project_role` VARCHAR(191) NULL,
    `api_key_id` VARCHAR(191) NULL,
    `type` ENUM('USER', 'API_KEY') NOT NULL DEFAULT 'USER',

    INDEX `audit_logs_api_key_id_idx`(`api_key_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    INDEX `audit_logs_org_id_idx`(`org_id`),
    INDEX `audit_logs_project_id_idx`(`project_id`),
    INDEX `audit_logs_updated_at_idx`(`updated_at`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `automation_executions` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `source_id` VARCHAR(191) NOT NULL,
    `automation_id` VARCHAR(191) NOT NULL,
    `trigger_id` VARCHAR(191) NOT NULL,
    `action_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `status` ENUM('COMPLETED', 'ERROR', 'PENDING', 'CANCELLED') NOT NULL DEFAULT 'PENDING',
    `input` JSON NOT NULL,
    `output` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,

    INDEX `automation_executions_action_id_idx`(`action_id`),
    INDEX `automation_executions_project_id_idx`(`project_id`),
    INDEX `automation_executions_trigger_id_idx`(`trigger_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `automations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `trigger_id` VARCHAR(191) NOT NULL,
    `action_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,

    INDEX `automations_project_id_action_id_trigger_id_idx`(`project_id`, `action_id`, `trigger_id`),
    INDEX `automations_project_id_name_idx`(`project_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `background_migrations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `script` VARCHAR(191) NOT NULL,
    `args` JSON NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,
    `failed_reason` VARCHAR(191) NULL,
    `worker_id` VARCHAR(191) NULL,
    `locked_at` DATETIME(3) NULL,
    `state` JSON NOT NULL,

    UNIQUE INDEX `background_migrations_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `batch_exports` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `finished_at` DATETIME(3) NULL,
    `expires_at` DATETIME(3) NULL,
    `name` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL,
    `query` JSON NOT NULL,
    `format` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NULL,
    `log` VARCHAR(191) NULL,

    INDEX `batch_exports_project_id_user_id_idx`(`project_id`, `user_id`),
    INDEX `batch_exports_status_idx`(`status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `billing_meter_backups` (
    `stripe_customer_id` VARCHAR(191) NOT NULL,
    `meter_id` VARCHAR(191) NOT NULL,
    `start_time` DATETIME(3) NOT NULL,
    `end_time` DATETIME(3) NOT NULL,
    `aggregated_value` INTEGER NOT NULL,
    `event_name` VARCHAR(191) NOT NULL,
    `org_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `billing_meter_backups_stripe_customer_id_meter_id_start_time_idx`(`stripe_customer_id`, `meter_id`, `start_time`, `end_time`),
    UNIQUE INDEX `billing_meter_backups_stripe_customer_id_meter_id_start_time_key`(`stripe_customer_id`, `meter_id`, `start_time`, `end_time`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `blob_storage_integrations` (
    `project_id` VARCHAR(191) NOT NULL,
    `type` ENUM('S3', 'S3_COMPATIBLE', 'AZURE_BLOB_STORAGE') NOT NULL,
    `bucket_name` VARCHAR(191) NOT NULL,
    `prefix` VARCHAR(191) NOT NULL,
    `access_key_id` VARCHAR(191) NULL,
    `secret_access_key` VARCHAR(191) NULL,
    `region` VARCHAR(191) NOT NULL,
    `endpoint` VARCHAR(191) NULL,
    `force_path_style` BOOLEAN NOT NULL,
    `next_sync_at` DATETIME(3) NULL,
    `last_sync_at` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL,
    `export_frequency` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `file_type` ENUM('JSON', 'CSV', 'JSONL') NOT NULL DEFAULT 'CSV',
    `export_mode` ENUM('FULL_HISTORY', 'FROM_TODAY', 'FROM_CUSTOM_DATE') NOT NULL DEFAULT 'FULL_HISTORY',
    `export_start_date` DATETIME(3) NULL,
    `export_source` ENUM('TRACES_OBSERVATIONS', 'TRACES_OBSERVATIONS_EVENTS', 'EVENTS') NOT NULL DEFAULT 'TRACES_OBSERVATIONS',

    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `comments` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `object_type` ENUM('TRACE', 'OBSERVATION', 'SESSION', 'PROMPT') NOT NULL,
    `object_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `content` VARCHAR(191) NOT NULL,
    `author_user_id` VARCHAR(191) NULL,
    `data_field` VARCHAR(191) NULL,
    `path` JSON NOT NULL,
    `range_start` JSON NOT NULL,
    `range_end` JSON NOT NULL,

    INDEX `comments_project_id_object_type_object_id_idx`(`project_id`, `object_type`, `object_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `comment_reactions` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `comment_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `comment_reactions_comment_id_user_id_emoji_key`(`comment_id`, `user_id`, `emoji`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `cron_jobs` (
    `name` VARCHAR(191) NOT NULL,
    `last_run` DATETIME(3) NULL,
    `state` VARCHAR(191) NULL,
    `job_started_at` DATETIME(3) NULL,

    PRIMARY KEY (`name`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `notification_preferences` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `channel` ENUM('EMAIL') NOT NULL,
    `type` ENUM('COMMENT_MENTION') NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notification_preferences_user_id_project_id_channel_type_key`(`user_id`, `project_id`, `channel`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `dashboard_widgets` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `view` ENUM('TRACES', 'OBSERVATIONS', 'SCORES_NUMERIC', 'SCORES_CATEGORICAL') NOT NULL,
    `dimensions` JSON NOT NULL,
    `metrics` JSON NOT NULL,
    `filters` JSON NOT NULL,
    `chart_type` ENUM('LINE_TIME_SERIES', 'AREA_TIME_SERIES', 'BAR_TIME_SERIES', 'HORIZONTAL_BAR', 'VERTICAL_BAR', 'PIE', 'NUMBER', 'HISTOGRAM', 'PIVOT_TABLE') NOT NULL,
    `chart_config` JSON NOT NULL,
    `min_version` INTEGER NOT NULL DEFAULT 1,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `dashboards` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `definition` JSON NOT NULL,
    `filters` JSON NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `dataset_items` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `valid_from` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `status` ENUM('ACTIVE', 'ARCHIVED') NULL DEFAULT 'ACTIVE',
    `input` JSON NULL,
    `expected_output` JSON NULL,
    `metadata` JSON NULL,
    `source_trace_id` VARCHAR(191) NULL,
    `source_observation_id` VARCHAR(191) NULL,
    `dataset_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `valid_to` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,

    INDEX `dataset_items_created_at_idx`(`created_at`),
    INDEX `dataset_items_dataset_id_idx`(`dataset_id`),
    INDEX `dataset_items_project_id_valid_to_idx`(`project_id`, `valid_to`),
    INDEX `dataset_items_project_id_id_valid_from_idx`(`project_id`, `id`, `valid_from`),
    INDEX `dataset_items_source_observation_id_idx`(`source_observation_id`),
    INDEX `dataset_items_source_trace_id_idx`(`source_trace_id`),
    INDEX `dataset_items_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`id`, `project_id`, `valid_from`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `dataset_run_items` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `dataset_run_id` VARCHAR(191) NOT NULL,
    `dataset_item_id` VARCHAR(191) NOT NULL,
    `trace_id` VARCHAR(191) NOT NULL,
    `observation_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dataset_run_items_created_at_idx`(`created_at`),
    INDEX `dataset_run_items_dataset_item_id_idx`(`dataset_item_id`),
    INDEX `dataset_run_items_dataset_run_id_idx`(`dataset_run_id`),
    INDEX `dataset_run_items_observation_id_idx`(`observation_id`),
    INDEX `dataset_run_items_trace_id_idx`(`trace_id`),
    INDEX `dataset_run_items_updated_at_idx`(`updated_at`),
    PRIMARY KEY (`id`, `project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `dataset_runs` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `dataset_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `dataset_runs_created_at_idx`(`created_at`),
    INDEX `dataset_runs_dataset_id_idx`(`dataset_id`),
    INDEX `dataset_runs_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `dataset_runs_dataset_id_project_id_name_key`(`dataset_id`, `project_id`, `name`),
    PRIMARY KEY (`id`, `project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `datasets` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `remote_experiment_url` VARCHAR(191) NULL,
    `remote_experiment_payload` JSON NULL,
    `input_schema` JSON NULL,
    `expected_output_schema` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `datasets_created_at_idx`(`created_at`),
    INDEX `datasets_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `datasets_project_id_name_key`(`project_id`, `name`),
    PRIMARY KEY (`id`, `project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `default_llm_models` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `llm_api_key_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `adapter` VARCHAR(191) NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `model_params` JSON NULL,

    UNIQUE INDEX `default_llm_models_project_id_key`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `eval_templates` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `prompt` TEXT NOT NULL,
    `model` VARCHAR(191) NULL,
    `model_params` JSON NULL,
    `vars` JSON NOT NULL,
    `output_schema` JSON NOT NULL,
    `provider` VARCHAR(191) NULL,
    `partner` VARCHAR(191) NULL,

    INDEX `eval_templates_project_id_id_idx`(`project_id`, `id`),
    UNIQUE INDEX `eval_templates_project_id_name_version_key`(`project_id`, `name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `job_configurations` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `job_type` ENUM('EVAL') NOT NULL,
    `eval_template_id` VARCHAR(191) NULL,
    `score_name` VARCHAR(191) NOT NULL,
    `filter` JSON NOT NULL,
    `target_object` VARCHAR(191) NOT NULL,
    `variable_mapping` JSON NOT NULL,
    `sampling` DECIMAL(65, 30) NOT NULL,
    `delay` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',
    `time_scope` JSON NOT NULL,

    INDEX `job_configurations_project_id_id_idx`(`project_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `job_executions` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `job_configuration_id` VARCHAR(191) NOT NULL,
    `status` ENUM('COMPLETED', 'ERROR', 'PENDING', 'CANCELLED', 'DELAYED') NOT NULL,
    `start_time` DATETIME(3) NULL,
    `end_time` DATETIME(3) NULL,
    `error` VARCHAR(191) NULL,
    `job_input_trace_id` VARCHAR(191) NULL,
    `job_output_score_id` VARCHAR(191) NULL,
    `job_input_dataset_item_id` VARCHAR(191) NULL,
    `job_input_dataset_item_valid_from` DATETIME(3) NULL,
    `job_input_observation_id` VARCHAR(191) NULL,
    `job_template_id` VARCHAR(191) NULL,
    `job_input_trace_timestamp` DATETIME(3) NULL,
    `execution_trace_id` VARCHAR(191) NULL,

    INDEX `job_executions_project_id_id_idx`(`project_id`, `id`),
    INDEX `job_executions_project_id_job_configuration_id_job_input_tra_idx`(`project_id`, `job_configuration_id`, `job_input_trace_id`),
    INDEX `job_executions_project_id_job_output_score_id_idx`(`project_id`, `job_output_score_id`),
    INDEX `job_executions_project_id_status_idx`(`project_id`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `llm_api_keys` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provider` VARCHAR(191) NOT NULL,
    `display_secret_key` VARCHAR(191) NOT NULL,
    `secret_key` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `base_url` VARCHAR(191) NULL,
    `adapter` VARCHAR(191) NOT NULL,
    `custom_models` JSON NOT NULL,
    `with_default_models` BOOLEAN NOT NULL DEFAULT true,
    `config` JSON NULL,
    `extra_headers` VARCHAR(191) NULL,
    `extra_header_keys` JSON NOT NULL,

    UNIQUE INDEX `llm_api_keys_id_key`(`id`),
    UNIQUE INDEX `llm_api_keys_project_id_provider_key`(`project_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `llm_schemas` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `schema` JSON NOT NULL,

    UNIQUE INDEX `llm_schemas_project_id_name_key`(`project_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `llm_tools` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,
    `parameters` JSON NOT NULL,

    UNIQUE INDEX `llm_tools_project_id_name_key`(`project_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `media` (
    `id` VARCHAR(191) NOT NULL,
    `sha_256_hash` CHAR(44) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `uploaded_at` DATETIME(3) NULL,
    `upload_http_status` INTEGER NULL,
    `upload_http_error` VARCHAR(191) NULL,
    `bucket_path` VARCHAR(191) NOT NULL,
    `bucket_name` VARCHAR(191) NOT NULL,
    `content_type` VARCHAR(191) NOT NULL,
    `content_length` BIGINT NOT NULL,

    UNIQUE INDEX `media_project_id_id_key`(`project_id`, `id`),
    UNIQUE INDEX `media_project_id_sha_256_hash_key`(`project_id`, `sha_256_hash`),
    INDEX `media_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `membership_invitations` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NULL,
    `invited_by_user_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `org_id` VARCHAR(191) NOT NULL,
    `org_role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE') NOT NULL,
    `project_role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE') NULL,

    UNIQUE INDEX `membership_invitations_id_key`(`id`),
    INDEX `membership_invitations_email_idx`(`email`),
    INDEX `membership_invitations_org_id_idx`(`org_id`),
    INDEX `membership_invitations_project_id_idx`(`project_id`),
    UNIQUE INDEX `membership_invitations_email_org_id_key`(`email`, `org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `models` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NULL,
    `model_name` VARCHAR(191) NOT NULL,
    `match_pattern` VARCHAR(191) NOT NULL,
    `start_date` DATETIME(3) NULL,
    `input_price` DECIMAL(65, 30) NULL,
    `output_price` DECIMAL(65, 30) NULL,
    `total_price` DECIMAL(65, 30) NULL,
    `unit` VARCHAR(191) NULL,
    `tokenizer_config` JSON NULL,
    `tokenizer_id` VARCHAR(191) NULL,

    UNIQUE INDEX `models_project_id_model_name_start_date_unit_key`(`project_id`, `model_name`, `start_date`, `unit`),
    INDEX `models_model_name_idx`(`model_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pricing_tiers` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `model_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `priority` INTEGER NOT NULL,
    `conditions` JSON NOT NULL,

    UNIQUE INDEX `pricing_tiers_model_id_priority_key`(`model_id`, `priority`),
    UNIQUE INDEX `pricing_tiers_model_id_name_key`(`model_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `observation_media` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `media_id` VARCHAR(191) NOT NULL,
    `trace_id` VARCHAR(191) NOT NULL,
    `observation_id` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `obs_media_proj_trace_obs_media_fld_key`(`project_id`, `trace_id`, `observation_id`, `media_id`, `field`),
    INDEX `observation_media_project_id_media_id_idx`(`project_id`, `media_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `observations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `start_time` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `end_time` DATETIME(3) NULL,
    `parent_observation_id` VARCHAR(191) NULL,
    `type` ENUM('SPAN', 'EVENT', 'GENERATION', 'AGENT', 'TOOL', 'CHAIN', 'RETRIEVER', 'EVALUATOR', 'EMBEDDING', 'GUARDRAIL') NOT NULL,
    `trace_id` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `model` VARCHAR(191) NULL,
    `modelParameters` JSON NULL,
    `input` JSON NULL,
    `output` JSON NULL,
    `level` ENUM('DEBUG', 'DEFAULT', 'WARNING', 'ERROR') NOT NULL DEFAULT 'DEFAULT',
    `status_message` VARCHAR(191) NULL,
    `completion_start_time` DATETIME(3) NULL,
    `completion_tokens` INTEGER NOT NULL DEFAULT 0,
    `prompt_tokens` INTEGER NOT NULL DEFAULT 0,
    `total_tokens` INTEGER NOT NULL DEFAULT 0,
    `version` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unit` VARCHAR(191) NULL,
    `prompt_id` VARCHAR(191) NULL,
    `input_cost` DECIMAL(65, 30) NULL,
    `output_cost` DECIMAL(65, 30) NULL,
    `total_cost` DECIMAL(65, 30) NULL,
    `internal_model` VARCHAR(191) NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `calculated_input_cost` DECIMAL(65, 30) NULL,
    `calculated_output_cost` DECIMAL(65, 30) NULL,
    `calculated_total_cost` DECIMAL(65, 30) NULL,
    `internal_model_id` VARCHAR(191) NULL,

    INDEX `observations_created_at_idx`(`created_at`),
    INDEX `observations_internal_model_idx`(`internal_model`),
    INDEX `observations_model_idx`(`model`),
    INDEX `observations_project_id_prompt_id_idx`(`project_id`, `prompt_id`),
    INDEX `observations_project_id_start_time_type_idx`(`project_id`, `start_time`, `type`),
    INDEX `observations_prompt_id_idx`(`prompt_id`),
    INDEX `observations_start_time_idx`(`start_time`),
    INDEX `observations_trace_id_project_id_start_time_idx`(`trace_id`, `project_id`, `start_time`),
    INDEX `observations_type_idx`(`type`),
    INDEX `observations_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `observations_id_project_id_key`(`id`, `project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `organization_memberships` (
    `id` VARCHAR(191) NOT NULL,
    `org_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE') NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `organization_memberships_user_id_idx`(`user_id`),
    UNIQUE INDEX `organization_memberships_org_id_user_id_key`(`org_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `organizations` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `cloud_config` JSON NULL,
    `metadata` JSON NULL,
    `cloud_billing_cycle_anchor` DATETIME(3) NULL,
    `cloud_billing_cycle_updated_at` DATETIME(3) NULL,
    `cloud_current_cycle_usage` INTEGER NULL,
    `cloud_free_tier_usage_threshold_state` VARCHAR(191) NULL,
    `ai_features_enabled` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `cloud_spend_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `org_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `threshold` DECIMAL(65, 30) NOT NULL,
    `triggered_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `cloud_spend_alerts_org_id_idx`(`org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `pending_deletions` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `object` VARCHAR(191) NOT NULL,
    `object_id` VARCHAR(191) NOT NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `pending_deletions_object_id_object_idx`(`object_id`, `object`),
    INDEX `pending_deletions_project_id_object_is_deleted_object_id_id_idx`(`project_id`, `object`, `is_deleted`, `object_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `posthog_integrations` (
    `project_id` VARCHAR(191) NOT NULL,
    `encrypted_posthog_api_key` VARCHAR(191) NOT NULL,
    `posthog_host_name` VARCHAR(191) NOT NULL,
    `last_sync_at` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL,
    `export_source` ENUM('TRACES_OBSERVATIONS', 'TRACES_OBSERVATIONS_EVENTS', 'EVENTS') NOT NULL DEFAULT 'TRACES_OBSERVATIONS',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `mixpanel_integrations` (
    `project_id` VARCHAR(191) NOT NULL,
    `encrypted_mixpanel_project_token` VARCHAR(191) NOT NULL,
    `mixpanel_region` VARCHAR(191) NOT NULL,
    `last_sync_at` DATETIME(3) NULL,
    `enabled` BOOLEAN NOT NULL,
    `export_source` ENUM('TRACES_OBSERVATIONS', 'TRACES_OBSERVATIONS_EVENTS', 'EVENTS') NOT NULL DEFAULT 'TRACES_OBSERVATIONS',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `prices` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `model_id` VARCHAR(191) NOT NULL,
    `usage_type` VARCHAR(191) NOT NULL,
    `price` DECIMAL(65, 30) NOT NULL,
    `project_id` VARCHAR(191) NULL,
    `pricing_tier_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `prices_model_id_usage_type_pricing_tier_id_key`(`model_id`, `usage_type`, `pricing_tier_id`),
    INDEX `prices_pricing_tier_id_idx`(`pricing_tier_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `project_memberships` (
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `org_membership_id` VARCHAR(191) NOT NULL,
    `role` ENUM('OWNER', 'ADMIN', 'MEMBER', 'VIEWER', 'NONE') NOT NULL,

    INDEX `project_memberships_org_membership_id_idx`(`org_membership_id`),
    INDEX `project_memberships_project_id_idx`(`project_id`),
    INDEX `project_memberships_user_id_idx`(`user_id`),
    PRIMARY KEY (`project_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `projects` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `name` VARCHAR(191) NOT NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `org_id` VARCHAR(191) NOT NULL,
    `deleted_at` DATETIME(3) NULL,
    `retention_days` INTEGER NULL,
    `has_traces` BOOLEAN NOT NULL DEFAULT false,
    `metadata` JSON NULL,

    INDEX `projects_org_id_idx`(`org_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `prompt_dependencies` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `parent_id` VARCHAR(191) NOT NULL,
    `child_name` VARCHAR(191) NOT NULL,
    `child_label` VARCHAR(191) NULL,
    `child_version` INTEGER NULL,

    INDEX `prompt_dependencies_project_id_child_name`(`project_id`, `child_name`),
    INDEX `prompt_dependencies_project_id_parent_id`(`project_id`, `parent_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `prompt_protected_labels` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `prompt_protected_labels_project_id_label_key`(`project_id`, `label`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `prompts` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL,
    `is_active` BOOLEAN NULL,
    `config` JSON NOT NULL,
    `prompt` JSON NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'text',
    `tags` JSON NOT NULL,
    `labels` JSON NOT NULL,
    `commit_message` VARCHAR(191) NULL,

    INDEX `prompts_created_at_idx`(`created_at`),
    INDEX `prompts_project_id_id_idx`(`project_id`, `id`),
    INDEX `prompts_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `prompts_project_id_name_version_key`(`project_id`, `name`, `version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `score_configs` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `data_type` ENUM('CATEGORICAL', 'NUMERIC', 'BOOLEAN') NOT NULL,
    `is_archived` BOOLEAN NOT NULL DEFAULT false,
    `min_value` DOUBLE NULL,
    `max_value` DOUBLE NULL,
    `categories` JSON NULL,
    `description` VARCHAR(191) NULL,

    INDEX `score_configs_created_at_idx`(`created_at`),
    INDEX `score_configs_data_type_idx`(`data_type`),
    INDEX `score_configs_is_archived_idx`(`is_archived`),
    INDEX `score_configs_project_id_idx`(`project_id`),
    INDEX `score_configs_updated_at_idx`(`updated_at`),
    UNIQUE INDEX `score_configs_id_project_id_key`(`id`, `project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `scores` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `name` VARCHAR(191) NOT NULL,
    `value` DOUBLE NULL,
    `observation_id` VARCHAR(191) NULL,
    `trace_id` VARCHAR(191) NOT NULL,
    `comment` VARCHAR(191) NULL,
    `source` ENUM('ANNOTATION', 'API', 'EVAL') NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `author_user_id` VARCHAR(191) NULL,
    `config_id` VARCHAR(191) NULL,
    `data_type` ENUM('CATEGORICAL', 'NUMERIC', 'BOOLEAN') NOT NULL DEFAULT 'NUMERIC',
    `string_value` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `queue_id` VARCHAR(191) NULL,

    INDEX `scores_author_user_id_idx`(`author_user_id`),
    INDEX `scores_config_id_idx`(`config_id`),
    INDEX `scores_created_at_idx`(`created_at`),
    INDEX `scores_observation_id_idx`(`observation_id`),
    INDEX `scores_project_id_name_idx`(`project_id`, `name`),
    INDEX `scores_source_idx`(`source`),
    INDEX `scores_timestamp_idx`(`timestamp`),
    INDEX `scores_trace_id_idx`(`trace_id`),
    INDEX `scores_value_idx`(`value`),
    UNIQUE INDEX `scores_id_project_id_key`(`id`, `project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `Session` (
    `id` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,
    `session_token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Session_session_token_key`(`session_token`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `slack_integrations` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NOT NULL,
    `team_name` VARCHAR(191) NOT NULL,
    `bot_token` VARCHAR(191) NOT NULL,
    `bot_user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `slack_integrations_project_id_key`(`project_id`),
    INDEX `slack_integrations_team_id_idx`(`team_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `sso_configs` (
    `domain` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `auth_provider` VARCHAR(191) NOT NULL,
    `auth_config` JSON NULL,

    PRIMARY KEY (`domain`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `surveys` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `survey_name` ENUM('org_onboarding', 'user_onboarding') NOT NULL,
    `response` JSON NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `user_email` VARCHAR(191) NULL,
    `org_id` VARCHAR(191) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `table_view_presets` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `table_name` VARCHAR(191) NOT NULL,
    `created_by` VARCHAR(191) NULL,
    `updated_by` VARCHAR(191) NULL,
    `filters` JSON NOT NULL,
    `column_order` JSON NOT NULL,
    `column_visibility` JSON NOT NULL,
    `search_query` VARCHAR(191) NULL,
    `order_by` JSON NULL,

    UNIQUE INDEX `table_view_presets_project_id_table_name_name_key`(`project_id`, `table_name`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `default_views` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `view_name` VARCHAR(191) NOT NULL,
    `view_id` VARCHAR(191) NOT NULL,

    INDEX `default_views_project_id_view_name_idx`(`project_id`, `view_name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `trace_media` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `media_id` VARCHAR(191) NOT NULL,
    `trace_id` VARCHAR(191) NOT NULL,
    `field` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `trace_media_project_id_trace_id_media_id_field_key`(`project_id`, `trace_id`, `media_id`, `field`),
    INDEX `trace_media_project_id_media_id_idx`(`project_id`, `media_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `trace_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `bookmarked` BOOLEAN NOT NULL DEFAULT false,
    `public` BOOLEAN NOT NULL DEFAULT false,
    `environment` VARCHAR(191) NOT NULL DEFAULT 'default',

    INDEX `trace_sessions_project_id_created_at_idx`(`project_id`, `created_at`),
    PRIMARY KEY (`id`, `project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `traces` (
    `id` VARCHAR(191) NOT NULL,
    `timestamp` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `name` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `metadata` JSON NULL,
    `external_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `release` VARCHAR(191) NULL,
    `version` VARCHAR(191) NULL,
    `public` BOOLEAN NOT NULL DEFAULT false,
    `bookmarked` BOOLEAN NOT NULL DEFAULT false,
    `input` JSON NULL,
    `output` JSON NULL,
    `session_id` VARCHAR(191) NULL,
    `tags` JSON NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `traces_created_at_idx`(`created_at`),
    INDEX `traces_id_user_id_idx`(`id`, `user_id`),
    INDEX `traces_name_idx`(`name`),
    INDEX `traces_project_id_timestamp_idx`(`project_id`, `timestamp`),
    INDEX `traces_session_id_idx`(`session_id`),
    INDEX `traces_timestamp_idx`(`timestamp`),
    INDEX `traces_user_id_idx`(`user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `triggers` (
    `id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `project_id` VARCHAR(191) NOT NULL,
    `eventSource` VARCHAR(191) NOT NULL,
    `eventActions` JSON NOT NULL,
    `filter` JSON NULL,
    `status` ENUM('ACTIVE', 'INACTIVE') NOT NULL DEFAULT 'ACTIVE',

    INDEX `triggers_project_id_idx`(`project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `users` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NULL,
    `email` VARCHAR(191) NULL,
    `email_verified` DATETIME(3) NULL,
    `password` VARCHAR(191) NULL,
    `image` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `feature_flags` JSON NOT NULL,
    `admin` BOOLEAN NOT NULL DEFAULT false,
    `v4_beta_enabled` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE IF NOT EXISTS `verification_tokens` (
    `identifier` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `expires` DATETIME(3) NOT NULL,

    UNIQUE INDEX `verification_tokens_token_key`(`token`),
    UNIQUE INDEX `verification_tokens_identifier_token_key`(`identifier`, `token`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `actions` ADD CONSTRAINT `actions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_assignments` ADD CONSTRAINT `annotation_queue_assignments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_assignments` ADD CONSTRAINT `annotation_queue_assignments_queue_id_fkey` FOREIGN KEY (`queue_id`) REFERENCES `annotation_queues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_assignments` ADD CONSTRAINT `annotation_queue_assignments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_items` ADD CONSTRAINT `annotation_queue_items_annotator_user_id_fkey` FOREIGN KEY (`annotator_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_items` ADD CONSTRAINT `annotation_queue_items_locked_by_user_id_fkey` FOREIGN KEY (`locked_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_items` ADD CONSTRAINT `annotation_queue_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queue_items` ADD CONSTRAINT `annotation_queue_items_queue_id_fkey` FOREIGN KEY (`queue_id`) REFERENCES `annotation_queues`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `annotation_queues` ADD CONSTRAINT `annotation_queues_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `api_keys` ADD CONSTRAINT `api_keys_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_executions` ADD CONSTRAINT `automation_executions_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_executions` ADD CONSTRAINT `automation_executions_automation_id_fkey` FOREIGN KEY (`automation_id`) REFERENCES `automations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_executions` ADD CONSTRAINT `automation_executions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automation_executions` ADD CONSTRAINT `automation_executions_trigger_id_fkey` FOREIGN KEY (`trigger_id`) REFERENCES `triggers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automations` ADD CONSTRAINT `automations_action_id_fkey` FOREIGN KEY (`action_id`) REFERENCES `actions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automations` ADD CONSTRAINT `automations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `automations` ADD CONSTRAINT `automations_trigger_id_fkey` FOREIGN KEY (`trigger_id`) REFERENCES `triggers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `batch_exports` ADD CONSTRAINT `batch_exports_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `blob_storage_integrations` ADD CONSTRAINT `blob_storage_integrations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comments` ADD CONSTRAINT `comments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment_reactions` ADD CONSTRAINT `comment_reactions_comment_id_fkey` FOREIGN KEY (`comment_id`) REFERENCES `comments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment_reactions` ADD CONSTRAINT `comment_reactions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `comment_reactions` ADD CONSTRAINT `comment_reactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification_preferences` ADD CONSTRAINT `notification_preferences_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_widgets` ADD CONSTRAINT `dashboard_widgets_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_widgets` ADD CONSTRAINT `dashboard_widgets_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboard_widgets` ADD CONSTRAINT `dashboard_widgets_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboards` ADD CONSTRAINT `dashboards_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboards` ADD CONSTRAINT `dashboards_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dashboards` ADD CONSTRAINT `dashboards_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dataset_items` ADD CONSTRAINT `dataset_items_dataset_id_project_id_fkey` FOREIGN KEY (`dataset_id`, `project_id`) REFERENCES `datasets`(`id`, `project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `dataset_run_items` ADD CONSTRAINT `dataset_run_items_dataset_run_id_project_id_fkey` FOREIGN KEY (`dataset_run_id`, `project_id`) REFERENCES `dataset_runs`(`id`, `project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
-- No FK from dataset_run_items to dataset_items (dataset_items has composite PK id+project_id+valid_from)

-- AddForeignKey
ALTER TABLE `dataset_runs` ADD CONSTRAINT `dataset_runs_dataset_id_project_id_fkey` FOREIGN KEY (`dataset_id`, `project_id`) REFERENCES `datasets`(`id`, `project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `datasets` ADD CONSTRAINT `datasets_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `default_llm_models` ADD CONSTRAINT `default_llm_models_llm_api_key_id_fkey` FOREIGN KEY (`llm_api_key_id`) REFERENCES `llm_api_keys`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `default_llm_models` ADD CONSTRAINT `default_llm_models_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `eval_templates` ADD CONSTRAINT `eval_templates_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_configurations` ADD CONSTRAINT `job_configurations_eval_template_id_fkey` FOREIGN KEY (`eval_template_id`) REFERENCES `eval_templates`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_configurations` ADD CONSTRAINT `job_configurations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_executions` ADD CONSTRAINT `job_executions_job_configuration_id_fkey` FOREIGN KEY (`job_configuration_id`) REFERENCES `job_configurations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `job_executions` ADD CONSTRAINT `job_executions_job_template_id_fkey` FOREIGN KEY (`job_template_id`) REFERENCES `eval_templates`(`id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `job_executions` ADD CONSTRAINT `job_executions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `llm_api_keys` ADD CONSTRAINT `llm_api_keys_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `llm_schemas` ADD CONSTRAINT `llm_schemas_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `llm_tools` ADD CONSTRAINT `llm_tools_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `media` ADD CONSTRAINT `media_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_invited_by_user_id_fkey` FOREIGN KEY (`invited_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membership_invitations` ADD CONSTRAINT `membership_invitations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `models` ADD CONSTRAINT `models_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pricing_tiers` ADD CONSTRAINT `pricing_tiers_model_id_fkey` FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_media` ADD CONSTRAINT `observation_media_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observation_media` ADD CONSTRAINT `observation_media_media_id_project_id_fkey` FOREIGN KEY (`media_id`, `project_id`) REFERENCES `media`(`id`, `project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `observations` ADD CONSTRAINT `observations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organization_memberships` ADD CONSTRAINT `organization_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cloud_spend_alerts` ADD CONSTRAINT `cloud_spend_alerts_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pending_deletions` ADD CONSTRAINT `pending_deletions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `posthog_integrations` ADD CONSTRAINT `posthog_integrations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `mixpanel_integrations` ADD CONSTRAINT `mixpanel_integrations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_model_id_fkey` FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_pricing_tier_id_fkey` FOREIGN KEY (`pricing_tier_id`) REFERENCES `pricing_tiers`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prices` ADD CONSTRAINT `prices_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_org_membership_id_fkey` FOREIGN KEY (`org_membership_id`) REFERENCES `organization_memberships`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `project_memberships` ADD CONSTRAINT `project_memberships_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_dependencies` ADD CONSTRAINT `prompt_dependencies_parent_id_fkey` FOREIGN KEY (`parent_id`) REFERENCES `prompts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_dependencies` ADD CONSTRAINT `prompt_dependencies_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompt_protected_labels` ADD CONSTRAINT `prompt_protected_labels_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `prompts` ADD CONSTRAINT `prompts_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `score_configs` ADD CONSTRAINT `score_configs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scores` ADD CONSTRAINT `scores_config_id_fkey` FOREIGN KEY (`config_id`) REFERENCES `score_configs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `scores` ADD CONSTRAINT `scores_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Session` ADD CONSTRAINT `Session_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `slack_integrations` ADD CONSTRAINT `slack_integrations_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `surveys` ADD CONSTRAINT `surveys_org_id_fkey` FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `surveys` ADD CONSTRAINT `surveys_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_view_presets` ADD CONSTRAINT `table_view_presets_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_view_presets` ADD CONSTRAINT `table_view_presets_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_view_presets` ADD CONSTRAINT `table_view_presets_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `default_views` ADD CONSTRAINT `default_views_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `default_views` ADD CONSTRAINT `default_views_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trace_media` ADD CONSTRAINT `trace_media_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trace_media` ADD CONSTRAINT `trace_media_media_id_project_id_fkey` FOREIGN KEY (`media_id`, `project_id`) REFERENCES `media`(`id`, `project_id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trace_sessions` ADD CONSTRAINT `trace_sessions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `traces` ADD CONSTRAINT `traces_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `triggers` ADD CONSTRAINT `triggers_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
