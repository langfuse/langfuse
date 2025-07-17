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
  BATCH_ACTION_EXPORT_ROW_LIMIT: z.coerce.number().positive().default(50_000),
  LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT: z.coerce
    .number()
    .positive()
    .default(50_000),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  SMTP_CONNECTION_URL: z.string().optional(),
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
    .default(10000),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(1000),
  LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: z.coerce
    .number()
    .positive()
    .default(3),

  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
  CLICKHOUSE_DB: z.string().default("default"),
  CLICKHOUSE_PASSWORD: z.string(),
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
  LANGFUSE_PROJECT_DELETE_CONCURRENCY: z.coerce.number().positive().default(1),
  LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_EXPERIMENT_CREATOR_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  STRIPE_SECRET_KEY: z.string().optional(),

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

  LANGFUSE_CACHE_MODEL_MATCH_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS: z.coerce.number().default(30),

  // Flags to toggle queue consumers on or off.
  QUEUE_CONSUMER_CLOUD_USAGE_METERING_QUEUE_IS_ENABLED: z
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
  QUEUE_CONSUMER_BLOB_STORAGE_INTEGRATION_QUEUE_IS_ENABLED: z
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

  LANGFUSE_S3_CONCURRENT_READS: z.coerce.number().positive().default(50),
  LANGFUSE_CLICKHOUSE_PROJECT_DELETION_CONCURRENCY_DURATION_MS: z.coerce
    .number()
    .positive()
    .default(600_000), // 10 minutes
  LANGFUSE_CLICKHOUSE_TRACE_DELETION_CONCURRENCY_DURATION_MS: z.coerce
    .number()
    .positive()
    .default(120_000), // 2 minutes

  LANGFUSE_EXPERIMENT_INSERT_INTO_AGGREGATING_MERGE_TREES: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_WEBHOOK_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_WEBHOOK_TIMEOUT_MS: z.coerce.number().positive().default(10000),
  LANGFUSE_ENTITY_CHANGE_QUEUE_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(2),
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1" // eslint-disable-line turbo/no-undeclared-env-vars
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
