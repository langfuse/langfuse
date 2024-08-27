import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  DATABASE_URL: z.string(),
  PORT: z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefoore we have to enforce them to be numbers",
    })
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(3030),
  LANGFUSE_WORKER_PASSWORD: z.string(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().optional(),
  BATCH_EXPORT_ROW_LIMIT: z.coerce.number().positive().default(50_000),
  BATCH_EXPORT_DOWNLOAD_LINK_EXPIRATION_HOURS: z.coerce
    .number()
    .positive()
    .default(24),
  EMAIL_FROM_ADDRESS: z.string().optional(),
  SMTP_CONNECTION_URL: z.string().optional(),
  LANGFUSE_INGESTION_FLUSH_PROCESSING_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(100),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_BATCH_SIZE: z.coerce
    .number()
    .positive()
    .default(1000),
  LANGFUSE_INGESTION_CLICKHOUSE_WRITE_INTERVAL_MS: z.coerce
    .number()
    .positive()
    .default(3000),
  LANGFUSE_INGESTION_CLICKHOUSE_MAX_ATTEMPTS: z.coerce
    .number()
    .positive()
    .default(3),
  LANGFUSE_LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .optional(),
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
  CLICKHOUSE_URL: z.string().url().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  LANGFUSE_WORKER_BETTERSTACK_TOKEN: z.string().optional(),
  LANGFUSE_LEGACY_INGESTION_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(25),
  LANGFUSE_EVAL_CREATOR_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(25),
  LANGFUSE_EVAL_EXECUTION_WORKER_CONCURRENCY: z.coerce
    .number()
    .positive()
    .default(5),
  STRIPE_SECRET_KEY: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
