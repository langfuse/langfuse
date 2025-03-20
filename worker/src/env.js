"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
const shared_1 = require("@langfuse/shared");
const zod_1 = require("zod");
const EnvSchema = zod_1.z.object({
  BUILD_ID: zod_1.z.string().optional(),
  NODE_ENV: zod_1.z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: zod_1.z.string(),
  HOSTNAME: zod_1.z.string().default("0.0.0.0"),
  PORT: zod_1.z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefore we have to enforce them to be numbers",
    })
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(3030),
  LANGFUSE_S3_BATCH_EXPORT_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_BATCH_EXPORT_BUCKET: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_PREFIX: zod_1.z.string().default(""),
  LANGFUSE_S3_BATCH_EXPORT_REGION: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_ENDPOINT: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_EXTERNAL_ENDPOINT: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_ACCESS_KEY_ID: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
  LANGFUSE_S3_BATCH_EXPORT_FORCE_PATH_STYLE: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: zod_1.z.string({
    required_error: "Langfuse requires a bucket name for S3 Event Uploads.",
  }),
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX: zod_1.z.string().default(""),
  LANGFUSE_S3_EVENT_UPLOAD_REGION: zod_1.z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: zod_1.z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: zod_1.z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  BATCH_EXPORT_ROW_LIMIT: zod_1.z.coerce.number().positive().default(1500000),
  BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS: zod_1.z.coerce
    .number()
    .positive()
    .default(24),
  BATCH_ACTION_EXPORT_ROW_LIMIT: zod_1.z.coerce
    .number()
    .positive()
    .default(50000),
  LANGFUSE_MAX_HISTORIC_EVAL_CREATION_LIMIT: zod_1.z.coerce
    .number()
    .positive()
    .default(50000),
  EMAIL_FROM_ADDRESS: zod_1.z.string().optional(),
  SMTP_CONNECTION_URL: zod_1.z.string().optional(),
  LANGFUSE_INGESTION_QUEUE_PROCESSING_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(20),
  LANGFUSE_INGESTION_SECONDARY_QUEUE_PROCESSING_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_SECONDARY_INGESTION_QUEUE_ENABLED_PROJECT_IDS: zod_1.z
    .string()
    .optional(),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: zod_1.z.coerce
    .number()
    .positive()
    .default(10000),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: zod_1.z.coerce
    .number()
    .positive()
    .default(1000),
  LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: zod_1.z.coerce
    .number()
    .positive()
    .default(3),
  REDIS_HOST: zod_1.z.string().nullish(),
  REDIS_PORT: zod_1.z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefore we have to enforce them to be numbers",
    })
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(6379)
    .nullable(),
  REDIS_AUTH: zod_1.z.string().nullish(),
  REDIS_CONNECTION_STRING: zod_1.z.string().nullish(),
  REDIS_ENABLE_AUTO_PIPELINING: zod_1.z.enum(["true", "false"]).default("true"),
  CLICKHOUSE_URL: zod_1.z.string().url(),
  CLICKHOUSE_USER: zod_1.z.string(),
  CLICKHOUSE_CLUSTER_NAME: zod_1.z.string().default("default"),
  CLICKHOUSE_DB: zod_1.z.string().default("default"),
  CLICKHOUSE_PASSWORD: zod_1.z.string(),
  LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(2),
  LANGFUSE_TRACE_UPSERT_WORKER_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(25),
  LANGFUSE_TRACE_DELETE_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(1),
  LANGFUSE_SCORE_DELETE_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(1),
  LANGFUSE_PROJECT_DELETE_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(1),
  LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(5),
  LANGFUSE_EXPERIMENT_CREATOR_WORKER_CONCURRENCY: zod_1.z.coerce
    .number()
    .positive()
    .default(5),
  STRIPE_SECRET_KEY: zod_1.z.string().optional(),
  // Skip the read from ClickHouse within the Ingestion pipeline for the given
  // project ids. Applicable for projects that were created after the S3 write
  // was activated and which don't rely on historic updates.
  LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_PROJECT_IDS: zod_1.z
    .string()
    .default(""),
  // Set a date after which S3 was active. Projects created after this date do
  // perform a ClickHouse read as part of the ingestion pipeline.
  LANGFUSE_SKIP_INGESTION_CLICKHOUSE_READ_MIN_PROJECT_CREATE_DATE: zod_1.z
    .string()
    .date()
    .optional(),
  // Otel
  OTEL_EXPORTER_OTLP_ENDPOINT: zod_1.z
    .string()
    .default("http://localhost:4318"),
  OTEL_SERVICE_NAME: zod_1.z.string().default("worker"),
  LANGFUSE_ENABLE_BACKGROUND_MIGRATIONS: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  LANGFUSE_ENABLE_REDIS_SEEN_EVENT_CACHE: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  // Flags to toggle queue consumers on or off.
  QUEUE_CONSUMER_CLOUD_USAGE_METERING_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_INGESTION_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BATCH_EXPORT_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_BATCH_ACTION_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_EVAL_EXECUTION_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_TRACE_UPSERT_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_CREATE_EVAL_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_TRACE_DELETE_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_SCORE_DELETE_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_PROJECT_DELETE_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DATASET_RUN_ITEM_UPSERT_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_EXPERIMENT_CREATE_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_POSTHOG_INTEGRATION_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_INGESTION_SECONDARY_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  QUEUE_CONSUMER_DATA_RETENTION_QUEUE_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  LANGFUSE_CACHE_MODEL_MATCH_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("true"),
  LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS: zod_1.z.coerce
    .number()
    .default(60 * 60),
  // Core data S3 upload - Langfuse Cloud
  LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CORE_DATA_UPLOAD_BUCKET: zod_1.z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_PREFIX: zod_1.z.string().default(""),
  LANGFUSE_S3_CORE_DATA_UPLOAD_REGION: zod_1.z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_ENDPOINT: zod_1.z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_ACCESS_KEY_ID: zod_1.z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
  LANGFUSE_S3_CORE_DATA_UPLOAD_FORCE_PATH_STYLE: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  // Media upload
  LANGFUSE_S3_MEDIA_UPLOAD_BUCKET: zod_1.z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_PREFIX: zod_1.z.string().default(""),
  LANGFUSE_S3_MEDIA_UPLOAD_REGION: zod_1.z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_ENDPOINT: zod_1.z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_ACCESS_KEY_ID: zod_1.z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_SECRET_ACCESS_KEY: zod_1.z.string().optional(),
  LANGFUSE_S3_MEDIA_UPLOAD_FORCE_PATH_STYLE: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  // Metering data Postgres export - Langfuse Cloud
  LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED: zod_1.z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CONCURRENT_READS: zod_1.z.coerce.number().positive().default(50),
});
exports.env =
  process.env.DOCKER_BUILD === "1"
    ? process.env
    : EnvSchema.parse((0, shared_1.removeEmptyEnvVariables)(process.env));
