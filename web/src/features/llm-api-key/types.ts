import { z } from "zod";
import {
  LLMAdapter,
  BedrockConfigSchema,
  OpenAIConfigSchema,
  VertexAIConfigSchema,
} from "@langfuse/shared";

const LlmApiKeyInputSchema = z.object({
  projectId: z.string(),
  provider: z
    .string()
    .min(1)
    .regex(/^[^:]+$/, "Provider name cannot contain colons"),
  adapter: z.enum(LLMAdapter),
  baseURL: z.url().nullish(),
  withDefaultModels: z.boolean().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  config: z
    .union([VertexAIConfigSchema, BedrockConfigSchema, OpenAIConfigSchema])
    .optional(),
  extraHeaders: z.record(z.string(), z.string()).optional(),
});

// The form's nonce for a Bedrock IAM role external ID.
const BedrockExternalIdNonce = z.uuid().optional();

export const CreateLlmApiKey = LlmApiKeyInputSchema.extend({
  secretKey: z.string().min(1),
  bedrockExternalIdNonce: BedrockExternalIdNonce,
});

export const UpdateLlmApiKey = LlmApiKeyInputSchema.extend({
  secretKey: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 1,
      "Secret key must be at least 1 character long",
    ),
  id: z.string(),
  bedrockExternalIdNonce: BedrockExternalIdNonce,
});

export const CreateOrganizationLlmApiKey = CreateLlmApiKey.omit({
  projectId: true,
}).extend({
  orgId: z.string(),
});

export const UpdateOrganizationLlmApiKey = UpdateLlmApiKey.omit({
  projectId: true,
}).extend({
  orgId: z.string(),
});

// Listing models only needs the endpoint and its credentials, so a form without
// a provider name or models yet can fetch them.
const ListLlmConnectionModelsFields = {
  adapter: true,
  baseURL: true,
  extraHeaders: true,
} as const;

export const ListLlmConnectionModels = CreateLlmApiKey.pick({
  ...ListLlmConnectionModelsFields,
  projectId: true,
  secretKey: true,
});

export const ListLlmConnectionModelsUpdate = UpdateLlmApiKey.pick({
  ...ListLlmConnectionModelsFields,
  projectId: true,
  secretKey: true,
  id: true,
});

export const ListOrganizationLlmConnectionModels =
  CreateOrganizationLlmApiKey.pick({
    ...ListLlmConnectionModelsFields,
    orgId: true,
    secretKey: true,
  });

export const ListOrganizationLlmConnectionModelsUpdate =
  UpdateOrganizationLlmApiKey.pick({
    ...ListLlmConnectionModelsFields,
    orgId: true,
    secretKey: true,
    id: true,
  });

export const AuthMethod = {
  ApiKey: "api-key",
  AccessKeys: "access-keys",
  DefaultCredentials: "default-credentials",
  IamRole: "iam-role",
} as const;

export const BedrockAuthMethodSchema = z.enum([
  AuthMethod.ApiKey,
  AuthMethod.AccessKeys,
  AuthMethod.DefaultCredentials,
  AuthMethod.IamRole,
]);

export type BedrockAuthMethod = z.infer<typeof BedrockAuthMethodSchema>;
