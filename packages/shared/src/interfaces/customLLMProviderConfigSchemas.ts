import { z } from "zod";

// Sentinel value for Bedrock default credential provider chain
export const BEDROCK_USE_DEFAULT_CREDENTIALS =
  "__BEDROCK_DEFAULT_CREDENTIALS__";

// Sentinel value for Vertex AI default credential provider chain (ADC)
export const VERTEXAI_USE_DEFAULT_CREDENTIALS =
  "__VERTEXAI_DEFAULT_CREDENTIALS__";

export const BedrockConfigSchema = z.object({ region: z.string() });
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

export const LLMConnectionConfigValueSchema = z.union([
  z.string(),
  z.boolean(),
]);
export const LLMConnectionConfigSchema = z.record(
  z.string(),
  LLMConnectionConfigValueSchema,
);
export type LLMConnectionConfig = z.infer<typeof LLMConnectionConfigSchema>;

export const OpenAIConfigSchema = z
  .object({
    useResponsesApi: z.boolean().default(false),
  })
  .strict();
export type OpenAIConfig = z.infer<typeof OpenAIConfigSchema>;

export const BedrockAccessKeysSchema = z
  .object({
    accessKeyId: z.string().min(1),
    secretAccessKey: z.string().min(1),
  })
  .strict();
export type BedrockAccessKeys = z.infer<typeof BedrockAccessKeysSchema>;

export const BedrockApiKeySchema = z
  .object({
    apiKey: z.string().min(1),
  })
  .strict();
export type BedrockApiKey = z.infer<typeof BedrockApiKeySchema>;

export const BedrockCredentialSchema = z.union([
  BedrockAccessKeysSchema,
  BedrockApiKeySchema,
]);
export type BedrockCredential = z.infer<typeof BedrockCredentialSchema>;

export const VertexAIConfigSchema = z
  .object({
    location: z.string().optional(),
    // Optional GCP project override used only when Application Default Credentials
    // (ADC) are in effect and the server has opted in via
    // VERTEXAI_ADC_ALLOW_PROJECT_OVERRIDE. Ignored otherwise.
    projectId: z.string().optional(),
  })
  .strict();

export type VertexAIConfig = z.infer<typeof VertexAIConfigSchema>;

export const GCPServiceAccountKeySchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string(),
  private_key_id: z.string(),
  private_key: z.string(),
  client_email: z.string(),
  client_id: z.string(),
  auth_uri: z.string(),
  token_uri: z.string(),
  auth_provider_x509_cert_url: z.string(),
  client_x509_cert_url: z.string(),
});

export type GCPServiceAccountKey = z.infer<typeof GCPServiceAccountKeySchema>;
export default GCPServiceAccountKeySchema;
