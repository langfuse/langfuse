import { z } from "zod";

// Sentinel value for Bedrock default credential provider chain
export const BEDROCK_USE_DEFAULT_CREDENTIALS =
  "__BEDROCK_DEFAULT_CREDENTIALS__";

// Sentinel value for Vertex AI default credential provider chain (ADC)
export const VERTEXAI_USE_DEFAULT_CREDENTIALS =
  "__VERTEXAI_DEFAULT_CREDENTIALS__";

export const BedrockConfigSchema = z.object({ region: z.string() });
export type BedrockConfig = z.infer<typeof BedrockConfigSchema>;

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
  })
  .strict();

export type VertexAIConfig = z.infer<typeof VertexAIConfigSchema>;

export const OciAuthModeSchema = z.enum(["api_key", "iam"]);
export type OciAuthMode = z.infer<typeof OciAuthModeSchema>;

const OCI_BASE_URL_HOSTNAME_REGEX =
  /^inference\.generativeai\.[^.]+\.oci\.oraclecloud\.com$/;
const OCI_BASE_URL_PATH_PREFIXES = ["/openai/v1", "/20231130/actions/v1"];

export const getOciBaseUrlValidationError = (url: string): string | null => {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== "https:") {
      return "OCI base URL must use HTTPS.";
    }

    if (!OCI_BASE_URL_HOSTNAME_REGEX.test(parsedUrl.hostname)) {
      return "OCI base URL must use an OCI Generative AI inference hostname.";
    }

    const pathname = parsedUrl.pathname.replace(/\/+$/, "");
    const isValidPath = OCI_BASE_URL_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    );

    if (!isValidPath) {
      return "OCI base URL must point to `/openai/v1` or `/20231130/actions/v1`.";
    }

    if (parsedUrl.search || parsedUrl.hash) {
      return "OCI base URL must not include query parameters or fragments.";
    }

    return null;
  } catch {
    return "OCI base URL must be a valid URL.";
  }
};

export const OciConfigSchema = z
  .object({
    authMode: OciAuthModeSchema.optional(),
    compartmentId: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.authMode === "iam" && !data.compartmentId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "compartmentId is required for OCI IAM authentication.",
        path: ["compartmentId"],
      });
    }
  });

export type OciConfig = z.infer<typeof OciConfigSchema>;

export const OciIAMCredentialSchema = z
  .object({
    tenancyId: z.string().min(1),
    userId: z.string().min(1),
    fingerprint: z.string().min(1),
    privateKey: z.string().min(1),
    passphrase: z.string().optional(),
    region: z.string().min(1).optional(),
  })
  .strict();

export type OciIAMCredential = z.infer<typeof OciIAMCredentialSchema>;

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
