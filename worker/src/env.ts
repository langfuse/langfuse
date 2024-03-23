import { z } from "zod";

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]),
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
});

export const env = EnvSchema.parse(process.env);
