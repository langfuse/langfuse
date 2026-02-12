import { removeEmptyEnvVariables } from "@langfuse/shared";
import { z } from "zod/v4";

const EnvSchema = z.object({
  BUILD_ID: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string(),
  HOSTNAME: z.string().default("0.0.0.0"),
  PORT: z.coerce
    .number() // ".env files convert numbers to strings, therefore we have to enforce them to be numbers"
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(3030),

  NEXTAUTH_URL: z.string().optional(),

  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z
    .enum(["US", "EU", "STAGING", "DEV", "HIPAA"])
    .optional(),

  STRIPE_SECRET_KEY: z.string().optional(),

  LANGFUSE_CACHE_AUTOMATIONS_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_CACHE_AUTOMATIONS_TTL_SECONDS: z.coerce.number().default(60),
  LANGFUSE_S3_BATCH_EXPORT_ENABLED: z.enum(["true", "false"]).default("false"),
  LANGFUSE_S3_BATCH_EXPORT_BUCKET: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_PREFIX: z.string().default(""),
  LANGFUSE_S3_BATCH_EXPORT_REGION: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY: z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_BATCH_EXPORT_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  LANGFUSE_S3_BATCH_EXPORT_SSE_KMS_KEY_ID: z.string().optional(),

  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string({
    error: "Langfuse requires a bucket name for S3 Event Uploads.",
  }),
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX: z.string().default(""),
  LANGFUSE_S3_EVENT_UPLOAD_REGION: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_EVENT_UPLOAD_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  LANGFUSE_S3_EVENT_UPLOAD_SSE_KMS_KEY_ID: z.string().optional(),

  BATCH_EXPORT_PAGE_SIZE: z.coerce.number().positive().default(500),
  BATCH_EXPORT_ROW_LIMIT: z.coerce.number().positive().default(1_500_000),
  BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS: z.coerce
    .number()
    .positive()
    .default(24),
  BATCH_EXPORT_S3_PART_SIZE_MIB: z.coerce.number().min(5).max(100).default(10),
  BATCH_ACTION_EXPORT_ROW_LIMIT: z.coerce.number().positive().default(50_000),
  LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT: z.coerce
    .number()
    .positive()
    .default(50_000),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  SMTP_CONNECTION_URL: z.string().optional(),
  CLOUD_CRM_EMAIL: z.string().optional(),
  LANGFUSE_OTEL_INGESTION_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(20),
  LANGFUSE_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_SECONDARY_INGESTION_QUEUE_ENABLED_PROJECT_IDS: z.string().optional(),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: z.coerce
    .number()
    .positive()
    .default(1000),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(1000),
  LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: z.coerce
    .number()
    .positive()
    .default(3),

  LANGFUSE_USE_AZURE_BLOB: z.enum(["true", "false"]).default("false"),

  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
  CLICKHOUSE_DB: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_CLUSTER_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_EVAL_CREATOR_LIMITER_DURATION: z.coerce
    .number()
    .positive()
    .default(500),
  LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(2),
  LANGFUSE_TRACE_UPSERT_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(25),
  LANGFUSE_TRACE_DELETE_CONCURRENCY: z.coerce.number().positive().default(1),
  LANGFUSE_SCORE_DELETE_CONCURRENCY: z.coerce.number().positive().default(1),
  LANGFUSE_DATASET_DELETE_CONCURRENCY: z.coerce.number().positive().default(1),
  LANGFUSE_PROJECT_DELETE_CONCURRENCY: z.coerce.number().positive().default(1),
  LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_EXPERIMENT_CREATOR_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),

  // Skip the read from ClickHouse within the Ingestion pipeline for the given
  // project ids. Applicable for projects that were created after the S3 write
  // was activated and which don't rely on historic updates.
  LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS: z.string().default(""),
  // Set a date after which S3 was active. Projects created after this date do
  // perform a ClickHouse read as part of the ingestion pipeline.
  LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE: z
    .string()
    .date()
    .optional(),

  // Otel
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().default("http://localhost:4318"),
  OTEL_SERVICE_NAME: z.string().default("worker"),

  LANGFUSE_ENABLE_BACKGROUND_MIGRATIONS: z
    .enum(["true", "false"])
    .default("true"),

  LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG: z
    .enum(["true", "false"])
    .default("true"),

  // Comma-separated list of project IDs that should only export traces table (skip observations and scores)
  LANGFUSE_BLOB_STORAGE_EXPORT_TRACE_ONLY_PROJECT_IDS: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((id) => id.trim()) : [])),

  // Flags to toggle queue consumers on or off.
  QUEUE_CONSUMER_CLOUD_USAGE_METERING_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_CLOUD_SPEND_ALERT_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_FREE_TIER_USAGE_THRESHOLD_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BATCH_ACTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_EVAL_EXECUTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_CREATE_EVAL_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_SCORE_DELETE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DATASET_DELETE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_PROJECT_DELETE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DATASET_RUN_ITEM_UPSERT_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_EXPERIMENT_CREATE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_POSTHOG_INTEGRATION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_MIXPANEL_INTEGRATION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BLOB_STORAGE_INTEGRATION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_OTEL_INGESTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DEAD_LETTER_RETRY_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  QUEUE_CONSUMER_WEBHOOK_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_ENTITY_CHANGE_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_EVENT_PROPAGATION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  QUEUE_CONSUMER_NOTIFICATION_QUEUE_IS_ENABLED: z
    .enum(["true", "false"])
    .default("true"),

  LANGFUSE_EVENT_PROPAGATION_WORKER_GLOBAL_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(10),
  LANGFUSE_DATASET_RUN_BACKFILL_CHUNK_SIZE: z.coerce
    .number()
    .positive()
    .default(200),
  LANGFUSE_EXPERIMENT_BACKFILL_THROTTLE_MS: z.coerce
    .number()
    .positive()
    .default(5 * 60 * 1000), // 5 minutes

  // Core data S3 upload - Langfuse Cloud
  LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET: z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX: z.string().default(""),
  LANGFUSE_S3_CORE_DATA_UPLOAD_REGION: z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CORE_DATA_UPLOAD_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_SSE_KMS_KEY_ID: z.string().optional(),

  // Media upload
  LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: z.string().default(""),
  LANGFUSE_S3_MEDIA_UPLOAD_REGION: z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_MEDIA_UPLOAD_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_SSE_KMS_KEY_ID: z.string().optional(),

  // Metering data Postgres export - Langfuse Cloud
  LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),

  // When disabled: Usage is still tracked in DB but no emails are sent and no orgs are blocked
  // When enabled: Full enforcement (emails + blocking)
  LANGFUSE_FREE_TIER_USAGE_THRESHOLD_ENFORCEMENT_ENABLED: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_S3_CONCURRENT_READS: z.coerce.number().positive().default(50),
  LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS: z.coerce
    .number()
    .positive()
    .default(600_000), // 10 minutes
  LANGFUSE_CLICKHOUSE_TRACE_DELETION_CONCURRENCY_DURATION_MS: z.coerce
    .number()
    .positive()
    .default(120_000), // 2 minutes
  LANGFUSE_CLICKHOUSE_DATASET_DELETION_CONCURRENCY_DURATION_MS: z.coerce
    .number()
    .positive()
    .default(120_000), // 2 minutes

  // Batch Project Cleaner configuration
  LANGFUSE_BATCH_PROJECT_CLEANER_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_BATCH_PROJECT_CLEANER_CHECK_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(600_000), // 10 minutes between checks after successful processing
  LANGFUSE_BATCH_PROJECT_CLEANER_SLEEP_ON_EMPTY_MS: z.coerce
    .number()
    .positive()
    .default(3_600_000), // 1 hour sleep when there is no data to process
  LANGFUSE_BATCH_PROJECT_CLEANER_PROJECT_LIMIT: z.coerce
    .number()
    .positive()
    .default(1000), // Max projects per batch
  LANGFUSE_BATCH_PROJECT_CLEANER_DELETE_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(3_600_000), // 1 hour for DELETE operations

  // Batch Data Retention Cleaner configuration (ClickHouse)
  LANGFUSE_BATCH_DATA_RETENTION_CLEANER_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_BATCH_DATA_RETENTION_CLEANER_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(3_600_000), // 1 hour between runs
  LANGFUSE_MEDIA_RETENTION_CLEANER_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(600_000), // 10 minutes between runs
  LANGFUSE_BATCH_DATA_RETENTION_CLEANER_PROJECT_LIMIT: z.coerce
    .number()
    .positive()
    .default(100), // Max projects per batch DELETE
  LANGFUSE_BATCH_DATA_RETENTION_CLEANER_CHUNK_SIZE: z.coerce
    .number()
    .positive()
    .default(100), // Chunk size for counting projects in ClickHouse
  LANGFUSE_BATCH_DATA_RETENTION_CLEANER_DELETE_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(3_600_000), // 1 hour for DELETE operations

  // Media Retention Cleaner configuration (S3/PostgreSQL)
  LANGFUSE_MEDIA_RETENTION_CLEANER_ITEM_LIMIT: z.coerce
    .number()
    .positive()
    .default(10_000), // Max items (media files) to process per batch

  // Batch Trace Deletion Cleaner configuration
  LANGFUSE_BATCH_TRACE_DELETION_CLEANER_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_BATCH_TRACE_DELETION_CLEANER_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(600_000), // 10 minutes between runs
  LANGFUSE_BATCH_TRACE_DELETION_CLEANER_LOCK_TTL_SECONDS: z.coerce
    .number()
    .positive()
    .default(7200), // 2 hours to handle worst-case deletions

  LANGFUSE_EXPERIMENT_BACKFILL_EXCLUDE_ATTRIBUTES_KEY: z
    .enum(["true", "false"])
    .default("false"),

  // Deprecated. Do not use!
  LANGFUSE_EXPERIMENT_RETURN_NEW_RESULT: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_EXPERIMENT_INSERT_INTO_EVENTS_TABLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_EXPERIMENT_EARLY_EXIT_EVENT_BATCH_JOB: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_WEBHOOK_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_WEBHOOK_TIMEOUT_MS: z.coerce.number().positive().default(10000),
  LANGFUSE_WEBHOOK_MAX_REDIRECTS: z.coerce.number().positive().default(10),
  LANGFUSE_ENTITY_CHANGE_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(2),
  LANGFUSE_DELETE_BATCH_SIZE: z.coerce.number().positive().default(2000),
  LANGFUSE_TOKEN_COUNT_WORKER_POOL_SIZE: z.coerce
    .number()
    .positive()
    .default(2),
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1" // eslint-disable-line turbo/no-undeclared-env-vars
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
