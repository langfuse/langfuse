import { z } from "zod";
import { removeEmptyEnvVariables } from "./utils/environment";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
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
  CLICKHOUSE_URL: z.string().url().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  LANGFUSE_ASYNC_CLICKHOUSE_INGESTION_PROCESSING: z
    .enum(["true", "false"])
    .default("false"),
  LANGFUSE_ASYNC_INGESTION_PROCESSING: z
    .enum(["true", "false"])
    .default("false"),
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
  LANGFUSE_S3_EVENT_UPLOAD_ENABLED: z.enum(["true", "false"]).default("false"),
  LANGFUSE_S3_EVENT_UPLOAD_BUCKET: z.string().optional(),
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

  LANGFUSE_CUSTOM_SSO_EMAIL_CLAIM: z.string().default("email"),
  LANGFUSE_CUSTOM_SSO_NAME_CLAIM: z.string().default("name"),
  LANGFUSE_CUSTOM_SSO_SUB_CLAIM: z.string().default("sub"),
  LANGFUSE_CUSTOM_SSO_PICTURE_CLAIM: z.string().default("picture"),
});

export const env = EnvSchema.parse(removeEmptyEnvVariables(process.env));
