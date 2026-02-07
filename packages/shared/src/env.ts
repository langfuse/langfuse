import { z } from "zod/v4";
import { removeEmptyEnvVariables } from "./utils/environment";

const EnvSchema = z.object({
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_URL: z.string().url().optional(),
  REDIS_HOST: z.string().nullish(),
  REDIS_PORT: z.coerce
    .number() // .env files convert numbers to strings, therefore we have to enforce them to be numbers
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(6379)
    .nullable(),
  REDIS_AUTH: z.string().nullish(),
  REDIS_USERNAME: z.string().nullish(),
  REDIS_CONNECTION_STRING: z.string().nullish(),
  REDIS_KEY_PREFIX: z.string().nullish(),
  REDIS_TLS_ENABLED: z.enum(["true", "false"]).default("false"),
  REDIS_TLS_CA_PATH: z.string().optional(),
  REDIS_TLS_CERT_PATH: z.string().optional(),
  REDIS_TLS_KEY_PATH: z.string().optional(),
  REDIS_TLS_SERVERNAME: z.string().optional(),
  REDIS_TLS_REJECT_UNAUTHORIZED: z.enum(["true", "false"]).optional(),
  REDIS_TLS_CHECK_SERVER_IDENTITY: z.enum(["true", "false"]).optional(),
  REDIS_TLS_SECURE_PROTOCOL: z.string().optional(),
  REDIS_TLS_CIPHERS: z.string().optional(),
  REDIS_TLS_HONOR_CIPHER_ORDER: z.enum(["true", "false"]).optional(),
  REDIS_TLS_KEY_PASSPHRASE: z.string().optional(),
  REDIS_ENABLE_AUTO_PIPELINING: z.enum(["true", "false"]).default("true"),
  // Redis Cluster Configuration
  REDIS_CLUSTER_ENABLED: z.enum(["true", "false"]).default("false"),
  REDIS_CLUSTER_NODES: z.string().optional(),
  REDIS_SENTINEL_ENABLED: z.enum(["true", "false"]).default("false"),
  REDIS_SENTINEL_NODES: z.string().optional(),
  REDIS_SENTINEL_MASTER_NAME: z.string().optional(),
  REDIS_SENTINEL_USERNAME: z.string().optional(),
  REDIS_SENTINEL_PASSWORD: z.string().optional(),
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32",
    )
    .optional(),
  LANGFUSE_CACHE_MODEL_MATCH_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS: z.coerce.number().default(86400), // 24 hours
  LANGFUSE_CACHE_PROMPT_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_CACHE_PROMPT_TTL_SECONDS: z.coerce.number().default(300), // 5 minutes
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_READ_ONLY_URL: z.string().url().optional(),
  CLICKHOUSE_EVENTS_READ_ONLY_URL: z.string().url().optional(),
  CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
  CLICKHOUSE_DB: z.string().default("default"),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_KEEP_ALIVE_IDLE_SOCKET_TTL: z.coerce.number().int().default(9000),
  CLICKHOUSE_MAX_OPEN_CONNECTIONS: z.coerce.number().int().default(25),
  // Optional to allow for server-setting fallbacks
  CLICKHOUSE_ASYNC_INSERT_MAX_DATA_SIZE: z.string().optional(),
  CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MS: z.coerce.number().int().optional(),
  CLICKHOUSE_ASYNC_INSERT_BUSY_TIMEOUT_MIN_MS: z.coerce
    .number()
    .int()
    .min(50)
    .optional(),
  CLICKHOUSE_LIGHTWEIGHT_DELETE_MODE: z
    .enum(["alter_update", "lightweight_update", "lightweight_update_force"])
    .default("alter_update"),
  CLICKHOUSE_UPDATE_PARALLEL_MODE: z
    .enum(["sync", "async", "auto"])
    .default("auto"),

  LANGFUSE_INGESTION_QUEUE_DELAY_MS: z.coerce
    .number()
    .nonnegative()
    .default(15_000),
  LANGFUSE_INGESTION_QUEUE_SHARD_COUNT: z.coerce.number().positive().default(1),
  LANGFUSE_OTEL_INGESTION_QUEUE_SHARD_COUNT: z.coerce
    .number()
    .positive()
    .default(1),
  LANGFUSE_TRACE_UPSERT_QUEUE_SHARD_COUNT: z.coerce
    .number()
    .positive()
    .default(1),
  LANGFUSE_TRACE_UPSERT_QUEUE_ATTEMPTS: z.coerce.number().positive().default(2),
  LANGFUSE_TRACE_DELETE_DELAY_MS: z.coerce
    .number()
    .nonnegative()
    .default(5_000),
  LANGFUSE_TRACE_DELETE_SKIP_PROJECT_IDS: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(",").map((id) => id.trim()) : [])),
  SALT: z.string().optional(), // used by components imported by web package
  LANGFUSE_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional(),
  LANGFUSE_LOG_FORMAT: z.enum(["text", "json"]).default("text"),
  LANGFUSE_LOG_PROPAGATED_HEADERS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CONCURRENT_WRITES: z.coerce.number().positive().default(50),
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string(), // Langfuse requires a bucket name for S3 Event Uploads.
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
  LANGFUSE_USE_AZURE_BLOB: z.enum(["true", "false"]).default("false"),
  LANGFUSE_AZURE_SKIP_CONTAINER_CHECK: z
    .enum(["true", "false"])
    .default("true"),
  LANGFUSE_USE_GOOGLE_CLOUD_STORAGE: z.enum(["true", "false"]).default("false"),
  LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  LANGFUSE_ENABLE_BLOB_STORAGE_FILE_LOG: z
    .enum(["true", "false"])
    .default("true"),

  LANGFUSE_S3_LIST_MAX_KEYS: z.coerce.number().positive().default(200),
  LANGFUSE_S3_RATE_ERROR_SLOWDOWN_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_RATE_ERROR_SLOWDOWN_TTL_SECONDS: z.coerce
    .number()
    .positive()
    .default(3600), // 1 hour
  LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CORE_DATA_EXPORT_SSE: z.enum(["AES256", "aws:kms"]).optional(),
  LANGFUSE_S3_CORE_DATA_EXPORT_SSE_KMS_KEY_ID: z.string().optional(),
  LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM: z.string().default("email"),
  LANGFUSE_CUSTOM_SSO_NAME_CLAIM: z.string().default("name"),
  LANGFUSE_CUSTOM_SSO_SUB_CLAIM: z.string().default("sub"),
  LANGFUSE_API_TRACE_OBSERVATIONS_SIZE_LIMIT_BYTES: z.coerce
    .number()
    .default(80e6), // 80MB
  LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS: z.coerce.number().default(600_000), // 10 minutes
  LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS: z.coerce.number().default(3), // Maximum attempts for socket hang up errors
  LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: z.string().optional(),
  LANGFUSE_INGESTION_PROCESSING_SAMPLED_PROJECTS: z
    .string()
    .optional()
    .transform((val) => {
      try {
        if (!val) return new Map<string, number>();

        const map = new Map<string, number>();
        const parts = val.split(",");

        for (const part of parts) {
          const [projectId, sampleRateStr] = part.split(":");

          if (!projectId || sampleRateStr === undefined) {
            throw new Error(`Invalid format: ${part}`);
          }

          // Validate sample rate is between 0 and 1
          const sampleRate = z.coerce
            .number()
            .min(0)
            .max(1)
            .parse(sampleRateStr);

          map.set(projectId, sampleRate);
        }

        return map;
      } catch {
        return new Map<string, number>();
      }
    }),
  LANGFUSE_WEBHOOK_WHITELISTED_IPS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  LANGFUSE_WEBHOOK_WHITELISTED_IP_SEGMENTS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  LANGFUSE_WEBHOOK_WHITELISTED_HOST: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  SLACK_CLIENT_ID: z.string().optional(),
  SLACK_CLIENT_SECRET: z.string().optional(),
  SLACK_STATE_SECRET: z.string().optional(),
  SLACK_FETCH_LIMIT: z.coerce
    .number()
    .positive()
    .optional()
    .default(5_000)
    .describe(
      "How many records should be fetched from Slack, before we give up",
    ),
  HTTPS_PROXY: z.string().optional(),

  LANGFUSE_SERVER_SIDE_IO_CHAR_LIMIT: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000),

  LANGFUSE_CLICKHOUSE_DATA_EXPORT_REQUEST_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(600_000), // 10 minutes

  LANGFUSE_EVENT_PROPAGATION_WORKER_GLOBAL_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(10),

  LANGFUSE_FETCH_LLM_COMPLETION_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(120_000), // 2 minutes

  LANGFUSE_AWS_BEDROCK_REGION: z.string().optional(),

  // API Performance Flags
  // Whether to add a `FINAL` modifier to the observations CTE in GET /api/public/traces.
  // Can be used to improve performance for self-hosters that are fully on the new OTel SDKs.
  LANGFUSE_API_CLICKHOUSE_DISABLE_OBSERVATIONS_FINAL: z
    .enum(["true", "false"])
    .default("false"),
  // Enable Redis-based tracking of projects using OTEL API to optimize ClickHouse queries.
  // When enabled, projects ingesting via OTEL API skip the FINAL modifier on some observations queries for better performance.
  LANGFUSE_SKIP_FINAL_FOR_OTEL_PROJECTS: z
    .enum(["true", "false"])
    .default("false"),

  // Langfuse AI Features
  LANGFUSE_AI_FEATURES_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_AI_FEATURES_SECRET_KEY: z.string().optional(),
  LANGFUSE_AI_FEATURES_HOST: z.string().optional(),
  LANGFUSE_AI_FEATURES_PROJECT_ID: z.string().optional(),

  // Dataset Service
  LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION: z
    .enum(["true", "false"])
    .default("true"),
  LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION: z
    .enum(["true", "false"])
    .default("true"),

  // EE License
  LANGFUSE_EE_LICENSE_KEY: z.string().optional(),

  // Ingestion Masking (EE feature)
  LANGFUSE_INGESTION_MASKING_CALLBACK_URL: z.string().url().optional(),
  LANGFUSE_INGESTION_MASKING_CALLBACK_TIMEOUT_MS: z.coerce
    .number()
    .positive()
    .default(500),
  LANGFUSE_INGESTION_MASKING_CALLBACK_FAIL_CLOSED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_INGESTION_MASKING_MAX_RETRIES: z.coerce
    .number()
    .nonnegative()
    .default(1),
  LANGFUSE_INGESTION_MASKING_PROPAGATED_HEADERS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((h) => h.toLowerCase().trim()) : [],
    ),
});

export type SharedEnv = z.infer<typeof EnvSchema>;

export const env: SharedEnv =
  process.env.DOCKER_BUILD === "1" // eslint-disable-line turbo/no-undeclared-env-vars
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
