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
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32"
    )
    .optional(),
});

export const env = EnvSchema.parse(process.env);
