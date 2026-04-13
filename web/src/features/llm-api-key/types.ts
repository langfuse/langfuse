import { z } from "zod";
import {
  LLMAdapter,
  BedrockConfigSchema,
  VertexAIConfigSchema,
  LLMApiKeySchema,
} from "@langfuse/shared";

export const LlmApiKeySchema = z.object({
  projectId: z.string(),
  provider: z
    .string()
    .min(1)
    .regex(/^[^:]+$/, "Provider name cannot contain colons"),
  adapter: z.enum(LLMAdapter),
  baseURL: z.string().url().optional(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: z.union([VertexAIConfigSchema, BedrockConfigSchema]).optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

export const CreateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z.string().min(1),
});

export const UpdateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 1,
      "Secret key must be at least 1 character long",
    ),
  id: z.string(),
});

export const AuthMethod = {
  ApiKey: "api-key",
  AccessKeys: "access-keys",
  DefaultCredentials: "default-credentials",
} as const;

export const BedrockAuthMethodSchema = z.enum([
  AuthMethod.ApiKey,
  AuthMethod.AccessKeys,
  AuthMethod.DefaultCredentials,
]);

export type BedrockAuthMethod = z.infer<typeof BedrockAuthMethodSchema>;

export const SafeLlmApiKeySchema = LLMApiKeySchema.extend({
  secretKey: z.undefined(),
  extraHeaders: z.undefined(),
  authMethod: BedrockAuthMethodSchema.optional(),
});

export type SafeLlmApiKey = z.infer<typeof SafeLlmApiKeySchema>;
