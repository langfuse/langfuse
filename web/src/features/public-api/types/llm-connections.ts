import { z } from "zod/v4";
import { paginationZod, LLMAdapter, type JSONValue } from "@langfuse/shared";
import { BedrockConfigSchema, VertexAIConfigSchema } from "@langfuse/shared";

// Base LLM connection response schema - strict to prevent secret leakage
export const LlmConnectionResponse = z
  .object({
    id: z.string(),
    provider: z.string(),
    adapter: z.string(),
    displaySecretKey: z.string(),
    baseURL: z.string().nullable(),
    customModels: z.array(z.string()),
    withDefaultModels: z.boolean(),
    extraHeaderKeys: z.array(z.string()),
    config: z.record(z.string(), z.unknown()).nullable(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
  })
  .strict();

// GET /api/public/llm-connections query parameters
export const GetLlmConnectionsV1Query = z
  .object({
    ...paginationZod,
  })
  .strict();

// GET /api/public/llm-connections response
export const GetLlmConnectionsV1Response = z
  .object({
    data: z.array(LlmConnectionResponse),
    meta: z.object({
      page: z.number(),
      limit: z.number(),
      totalItems: z.number(),
      totalPages: z.number(),
    }),
  })
  .strict();

// Base request schema (before adapter-specific validation)
const PutLlmConnectionV1BodyBase = z.object({
  provider: z.string().min(1),
  adapter: z.nativeEnum(LLMAdapter),
  secretKey: z.string().min(1),
  baseURL: z.string().url().nullable().optional(),
  customModels: z.array(z.string().min(1)).optional(),
  withDefaultModels: z.boolean().optional().default(true),
  extraHeaders: z.record(z.string(), z.string()).optional(),
  config: z.record(z.string(), z.string()).optional(),
});

// PUT /api/public/llm-connections request body (upsert) with adapter-specific validation
export const PutLlmConnectionV1Body = PutLlmConnectionV1BodyBase.superRefine(
  (data, ctx) => {
    const { adapter, config } = data;

    if (adapter === LLMAdapter.Bedrock) {
      // Bedrock requires config with region
      if (!config) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Config is required for Bedrock adapter. Expected: { region: string }",
          path: ["config"],
        });
        return;
      }
      const result = BedrockConfigSchema.safeParse(config);
      if (!result.success) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Invalid Bedrock config: ${result.error.issues.map((e) => e.message).join(", ")}. Expected: { region: string }`,
          path: ["config"],
        });
      }
    } else if (adapter === LLMAdapter.VertexAI) {
      // VertexAI config is optional, but if provided must be valid
      if (config) {
        const result = VertexAIConfigSchema.safeParse(config);
        if (!result.success) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Invalid VertexAI config: ${result.error.issues.map((e) => e.message).join(", ")}. Expected: { location: string }`,
            path: ["config"],
          });
        }
      }
    } else {
      // Other adapters should not have config
      if (config && Object.keys(config).length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Config is not supported for ${adapter} adapter. Remove the config field.`,
          path: ["config"],
        });
      }
    }
  },
);

// PUT /api/public/llm-connections response
export const PutLlmConnectionV1Response = LlmConnectionResponse.strict();

// Transform database record to API response
export function transformDbLlmConnectionToAPI(dbConnection: {
  id: string;
  provider: string;
  adapter: string;
  displaySecretKey: string;
  baseURL: string | null;
  customModels: string[];
  withDefaultModels: boolean;
  extraHeaderKeys: string[];
  config: JSONValue | null;
  createdAt: Date;
  updatedAt: Date;
}): z.infer<typeof LlmConnectionResponse> {
  return LlmConnectionResponse.parse({
    id: dbConnection.id,
    provider: dbConnection.provider,
    adapter: dbConnection.adapter,
    displaySecretKey: dbConnection.displaySecretKey,
    baseURL: dbConnection.baseURL,
    customModels: dbConnection.customModels,
    withDefaultModels: dbConnection.withDefaultModels,
    extraHeaderKeys: dbConnection.extraHeaderKeys,
    config: dbConnection.config,
    createdAt: dbConnection.createdAt,
    updatedAt: dbConnection.updatedAt,
  });
}
