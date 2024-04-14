import { z } from "zod";

const EnvSchema = z.object({
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z.string().optional(),
});

export const env = EnvSchema.parse(process.env);
