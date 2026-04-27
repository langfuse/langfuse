import { z } from "zod";
import {
  getOciBaseUrlValidationError,
  LLMAdapter,
  BedrockConfigSchema,
  OciConfigSchema,
  OciIAMCredentialSchema,
  VertexAIConfigSchema,
  LLMApiKeySchema,
} from "@langfuse/shared";

export const LlmApiKeySchema = z
  .object({
    projectId: z.string(),
    provider: z
      .string()
      .min(1)
      .regex(/^[^:]+$/, "Provider name cannot contain colons"),
    adapter: z.enum(LLMAdapter),
    baseURL: z.string().url().optional(),
    withDefaultModels: z.boolean().optional(),
    customModels: z.array(z.string().min(1)).optional(),
    config: z
      .union([VertexAIConfigSchema, BedrockConfigSchema, OciConfigSchema])
      .optional(),
    extraHeaders: z.record(z.string(), z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.adapter === LLMAdapter.Oci) {
      if (!data.baseURL) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "API Base URL is required for OCI connections.",
          path: ["baseURL"],
        });
      } else {
        const baseUrlError = getOciBaseUrlValidationError(data.baseURL);
        if (baseUrlError) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: baseUrlError,
            path: ["baseURL"],
          });
        }
      }

      if (!data.customModels?.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one custom model is required for OCI.",
          path: ["customModels"],
        });
      }

      if (data.config) {
        const configResult = OciConfigSchema.safeParse(data.config);
        if (!configResult.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message:
              'Invalid OCI config. Expected: { authMode?: "api_key" | "iam", compartmentId?: string }',
            path: ["config"],
          });
          return;
        }
      }
    }
  });

const validateOciSecretKey = (
  data: z.infer<typeof LlmApiKeySchema> & { secretKey?: string },
  ctx: z.RefinementCtx,
) => {
  if (data.adapter !== LLMAdapter.Oci || !data.secretKey) {
    return;
  }

  const ociConfig = OciConfigSchema.safeParse(data.config);
  if (!ociConfig.success || ociConfig.data.authMode !== "iam") return;

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(data.secretKey);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "OCI IAM credentials must be valid JSON with tenancyId, userId, fingerprint, and privateKey.",
      path: ["secretKey"],
    });
    return;
  }

  const credentialsResult = OciIAMCredentialSchema.safeParse(parsedJson);
  if (!credentialsResult.success) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "OCI IAM credentials must include tenancyId, userId, fingerprint, and privateKey.",
      path: ["secretKey"],
    });
  }
};

export const CreateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z.string().min(1),
}).superRefine(validateOciSecretKey);

export const UpdateLlmApiKey = LlmApiKeySchema.extend({
  secretKey: z
    .string()
    .optional()
    .refine(
      (val) => !val || val.length >= 1,
      "Secret key must be at least 1 character long",
    ),
  id: z.string(),
}).superRefine(validateOciSecretKey);

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
