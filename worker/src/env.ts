import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  SENTRY_DSN: z.string().url().optional(),
  DATABASE_URL: z.string(),
  PORT: z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefoore we have to enforce them to be numbers",
    })
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(3030),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce
    .number({
      description:
        ".env files convert numbers to strings, therefoore we have to enforce them to be numbers",
    })
    .positive()
    .max(65536, `options.port should be >= 0 and < 65536`)
    .default(6379),
  REDIS_AUTH: z.string(),
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
});

export const env = EnvSchema.parse(process.env);
