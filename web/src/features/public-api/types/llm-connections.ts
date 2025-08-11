import { z } from "zod/v4";
import { paginationZod, LLMAdapter } from "@langfuse/shared";

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

// PUT /api/public/llm-connections request body (upsert)
export const PutLlmConnectionV1Body = z
  .object({
    provider: z.string().min(1),
    adapter: z.nativeEnum(LLMAdapter),
    secretKey: z.string().min(1),
    baseURL: z.string().url().nullable().optional(),
    customModels: z.array(z.string().min(1)).optional(),
    withDefaultModels: z.boolean().optional().default(true),
    extraHeaders: z.record(z.string(), z.string()).optional(),
  })
  .strict();

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
    createdAt: dbConnection.createdAt,
    updatedAt: dbConnection.updatedAt,
  });
}
