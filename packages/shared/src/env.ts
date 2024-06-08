import { z } from "zod";

const EnvSchema = z.object({
  ENCRYPTION_KEY: z
    .string()
    .length(
      64,
      "ENCRYPTION_KEY must be 256 bits, 64 string characters in hex format, generate via: openssl rand -hex 32"
    )
    .optional(),
  SALT: z.string({
    required_error:
      "A strong Salt is required to encrypt API keys securely. See: https://langfuse.com/docs/deployment/self-host#deploy-the-container",
  }),
});

export const env = EnvSchema.parse(process.env);
