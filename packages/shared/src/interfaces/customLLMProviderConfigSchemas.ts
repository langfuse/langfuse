import { z } from "zod";

// Sentinel value for Bedrock default credential provider chain
export const BEDROCK_USE_DEFAULT_CREDENTIALS =
  "__BEDROCK_DEFAULT_CREDENTIALS__";

// Sentinel value for Vertex AI default credential provider chain (ADC)
export const VERTEXAI_USE_DEFAULT_CREDENTIALS =
  "__VERTEXAI_DEFAULT_CREDENTIALS__";

// Sentinel value for the Azure default credential chain (managed identity,
// workload identity, environment, Azure CLI) via Microsoft Entra ID
export const AZURE_USE_DEFAULT_CREDENTIALS = "__AZURE_DEFAULT_CREDENTIALS__";

// Sentinel the blob-storage form sends as the GCS secret to request the
// deployment's default credentials (ADC) instead of a service account key.
// Never persisted: a keyless GCS integration stores secretAccessKey = null.
export const GCS_USE_DEFAULT_CREDENTIALS = "__GCS_DEFAULT_CREDENTIALS__";

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

// The tenant flows into the Entra authority URL path
// (https://login.microsoftonline.com/{tenantId}), so it is limited to a
// tenant GUID or a verified domain name.
const AZURE_TENANT_ID_PATTERN =
  /^[0-9A-Za-z](?:[0-9A-Za-z.-]{0,253}[0-9A-Za-z])?$/;

export const AzureEntraServicePrincipalSchema = z
  .object({
    tenantId: z
      .string()
      .regex(
        AZURE_TENANT_ID_PATTERN,
        "Tenant ID must be a directory (tenant) ID or a verified domain name",
      ),
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  })
  .strict();
export type AzureEntraServicePrincipal = z.infer<
  typeof AzureEntraServicePrincipalSchema
>;

export type AzureCredential =
  | { type: "api-key"; apiKey: string }
  | ({ type: "service-principal" } & AzureEntraServicePrincipal)
  | { type: "default-credentials" };

export const INVALID_AZURE_ENTRA_CREDENTIALS_MESSAGE =
  "Invalid Azure Entra ID credentials. Expected a JSON object with {tenantId, clientId, clientSecret}.";

/**
 * Resolves the persisted Azure secret contract: the default-credentials
 * sentinel, a service principal JSON object, or a plain API key. Azure API
 * keys never start with `{`, so a JSON-looking secret must be a valid
 * service principal.
 */
export function parseAzureCredential(secretKey: string): AzureCredential {
  if (secretKey === AZURE_USE_DEFAULT_CREDENTIALS) {
    return { type: "default-credentials" };
  }

  if (!secretKey.trimStart().startsWith("{")) {
    return { type: "api-key", apiKey: secretKey };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(secretKey);
  } catch {
    throw new Error(INVALID_AZURE_ENTRA_CREDENTIALS_MESSAGE);
  }

  const result = AzureEntraServicePrincipalSchema.safeParse(parsedJson);
  if (!result.success) {
    throw new Error(
      `${INVALID_AZURE_ENTRA_CREDENTIALS_MESSAGE} ${result.error.issues.map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message)).join("; ")}`,
    );
  }

  return { type: "service-principal", ...result.data };
}

export const VertexAIConfigSchema = z
  .object({
    location: z.string().optional(),
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
