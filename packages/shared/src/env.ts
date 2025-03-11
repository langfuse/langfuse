import { z } from "zod";
import { removeEmptyEnvVariables } from "./utils/environment";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_URL: z.string().url().optional(),
  REDIS_HOST: z.string().nullish(),
  REDIS_PORT: z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefoore we have to enforce them to be numbers",
    })
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
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32",
    )
    .optional(),
  LANGFUSE_CACHE_PROMPT_ENABLED: z.enum(["true", "false"]).default("false"),
  LANGFUSE_CACHE_PROMPT_TTL_SECONDS: z.coerce.number().default(60 * 60),
  CLICKHOUSE_URL: z.string().url(),
  CLICKHOUSE_CLUSTER_NAME: z.string().default("default"),
  CLICKHOUSE_DB: z.string().default("default"),
  CLICKHOUSE_USER: z.string(),
  CLICKHOUSE_PASSWORD: z.string(),

  LANGFUSE_INGESTION_QUEUE_DELAY_MS: z.coerce
    .number()
    .nonnegative()
    .default(15_000),
  SALT: z.string().optional(), // used by components imported by web package
  LANGFUSE_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional(),
  LANGFUSE_LOG_FORMAT: z.enum(["text", "json"]).default("text"),
  ENABLE_AWS_CLOUDWATCH_METRIC_PUBLISHING: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_S3_CONCURRENT_WRITES: z.coerce
    .number()
    .positive()
    .default(50),
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string({
    required_error: "Langfuse requires a bucket name for S3 Event Uploads.",
  }),
  LANGFUSE_S3_EVENT_UPLOAD_PREFIX: z.string().default(""),
  LANGFUSE_S3_EVENT_UPLOAD_REGION: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ENDPOINT: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_ACCESS_KEY_ID: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_SECRET_ACCESS_KEY: z.string().optional(),
  LANGFUSE_S3_EVENT_UPLOAD_FORCE_PATH_STYLE: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_USE_AZURE_BLOB: z.enum(["true", "false"]).default("false"),
  STRIPE_SECRET_KEY: z.string().optional(),

  LANGFUSE_S3_CORE_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_POSTGRES_METERING_DATA_EXPORT_IS_ENABLED: z
    .enum(["true", "false"])
    .default("false"),

  LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM: z.string().default('email'),
  LANGFUSE_CUSTOM_SSO_NAME_CLAIM: z.string().default('name'),
  LANGFUSE_CUSTOM_SSO_SUB_CLAIM: z.string().default('sub'),
});

export const env: z.infer<typeof EnvSchema> =
  process.env.DOCKER_BUILD === "1"
    ? (process.env as any)
    : EnvSchema.parse(removeEmptyEnvVariables(process.env));
