import { z } from "zod";

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
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32"
    )
    .optional(),
  LANGFUSE_CACHE_PROMPT_ENABLED: z.enum(["true", "false"]).default("false"),
  LANGFUSE_CACHE_PROMPT_TTL_SECONDS: z.coerce.number().default(60 * 60),
  CLICKHOUSE_URL: z.string().url().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
  LANGFUSE_INGESTION_FLUSH_DELAY_MS: z.coerce
    .number()
    .nonnegative()
    .default(10000),
  LANGFUSE_INGESTION_FLUSH_ATTEMPTS: z.coerce.number().positive().default(3),
  LANGFUSE_INGESTION_BUFFER_TTL_SECONDS: z.coerce
    .number()
    .positive()
    .default(60 * 10),
});

export const env = EnvSchema.parse(process.env);
