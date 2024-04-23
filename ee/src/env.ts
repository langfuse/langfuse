import { z } from "zod";
import { env as sharedEnv } from "@langfuse/shared";

const EnvSchema = z.object({
  NEXT_PUBLIC_LANGFUSE_CLOUD_REGION: z.string().optional(),
  ADMIN_API_KEY: z.string().optional(),
});

export const env = { ...sharedEnv, ...EnvSchema.parse(process.env) };
