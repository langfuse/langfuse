import { z } from "zod/v4";

export const BedrockConfigSchema = z.object({ region: z.string() });
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

export const BedrockCredentialSchema = z
  .object({
    accessKeyId: z.string(),
    secretAccessKey: z.string(),
  })
  .optional();
export type BedrockCredential = z.infer<typeof BedrockCredentialSchema>;

export const VertexAIConfigSchema = z.object({ location: z.string() });
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
