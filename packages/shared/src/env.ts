import { z } from "zod";

const EnvSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32"
    )
    .optional(),
  CLICKHOUSE_URL: z.string().optional(),
  CLICKHOUSE_USER: z.string().optional(),
  CLICKHOUSE_PASSWORD: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
