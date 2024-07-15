import { z } from "zod";

const EnvSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32"
    )
    .optional(),
  CLICKHOUSE_URL: z.string().optional().default("http://localhost:8123"),
  CLICKHOUSE_USER: z.string().optional().default("clickhouse"),
  CLICKHOUSE_PASSWORD: z.string().optional().default("clickhouse"),
});

export const env = EnvSchema.parse(process.env);
