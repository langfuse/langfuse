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
  REDIS_CONNECTION_STRING: z.string().nullish(),
  REDIS_TLS_ENABLED: z.enum(["true", "false"]).default("false"),
  REDIS_TLS_CA_PATH: z.string().optional(),
  REDIS_TLS_CERT_PATH: z.string().optional(),
  REDIS_TLS_KEY_PATH: z.string().optional(),
  REDIS_ENABLE_AUTO_PIPELINING: z.enum(["true", "false"]).default("true"),
  // Redis Cluster Configuration
  REDIS_CLUSTER_ENABLED: z.enum(["true", "false"]).default("false"),
  REDIS_CLUSTER_NODES: z.string().optional(),
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32",
    )
    .optional(),
  LANGFUSE_CACHE_PROMPT_ENABLED: z.enum(["true", "false"]).default("true"),
  LANGFUSE_CACHE_PROMPT_TTL_SECONDS: z.coerce.number().default(300),
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
  CLICKHOUSE_DB: z.string().default("default"),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_PASSWORD: z.string(),
  CLICKHOUSE_KEEP_ALIVE_IDLE_SOCKET_TTL: z.coerce.number().int().default(9000),
  CLICKHOUSE_MAX_OPEN_CONNECTIONS: z.coerce.number().int().default(25),

  LANGFUSE_INGESTION_QUEUE_DELAY_MS: z.coerce
    .number()
    .nonnegative()
    .default(15_000),
  LANGFUSE_INGESTION_QUEUE_SHARD_COUNT: z.coerce.number().positive().default(1),
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
  LANGFUSE_USE_GOOGLE_CLOUD_STORAGE: z.enum(["true", "false"]).default("false"),
  LANGFUSE_GOOGLE_CLOUD_STORAGE_CREDENTIALS: z.string().optional(),
  STRIPE_SECRET_KEY: z.string().optional(),

  LANGFUSE_S3_LIST_MAX_KEYS: z.coerce.number().positive().default(200),
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
  LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS: z.coerce.number().default(240_000), // 4 minutes
  LANGFUSE_CLICKHOUSE_QUERY_MAX_ATTEMPTS: z.coerce.number().default(3), // Maximum attempts for socket hang up errors
  LANGFUSE_SKIP_S3_LIST_FOR_OBSERVATIONS_PROJECT_IDS: z.string().optional(),

  LANGFUSE_EXPERIMENT_COMPARE_READ_FROM_AGGREGATING_MERGE_TREES: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_EXPERIMENT_ADD_QUERY_RESULT_TO_SPAN_PROJECT_IDS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  LANGFUSE_EXPERIMENT_SAMPLING_RATE: z.coerce
    .number()
    .min(0)
    .max(1)
    .default(0.1),
  LANGFUSE_EXPERIMENT_WHITELISTED_PROJECT_IDS: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((s) => s.toLowerCase().trim()) : [],
    ),
  LANGFUSE_EXPERIMENT_RETURN_NEW_RESULT: z
    .enum(["true", "false"])
    .default("false"),
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1" // eslint-disable-line turbo/no-undeclared-env-vars
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
