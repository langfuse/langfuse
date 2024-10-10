import { z } from "zod";

export const BedrockConfigSchema = z.object({ region: z.string() });
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

export const BedrockCredentialSchema = z
  .object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
    sessionToken: z.string().optional(),
  })
  .optional();
export type BedrockCredential = z.infer<typeof BedrockCredentialSchema>;
