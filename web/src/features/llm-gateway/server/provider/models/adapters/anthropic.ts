import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/llm-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

// API contract: https://platform.claude.com/docs/en/api/models/list
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      type: z.literal("model").optional(),
      display_name: z.string().optional(),
      created_at: z.string().optional(),
      capabilities: z.record(z.string(), z.unknown()).nullable().optional(),
      max_input_tokens: z.number().nullable().optional(),
      max_tokens: z.number().nullable().optional(),
    }),
  ),
  has_more: z.boolean(),
  last_id: z.string().nullable().optional(),
});

export const anthropicModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, fetcher }) {
    const definition = getGatewayProviderDefinition("ANTHROPIC");
    const models: GatewayModelCatalogEntry[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 100; page += 1) {
      const url = new URL(`${definition.baseUrl}${definition.modelsPath}`);
      url.searchParams.set("limit", "1000");
      if (cursor) url.searchParams.set("after_id", cursor);

      const result = await requestJson({
        fetcher,
        url,
        headers: {
          "x-api-key": credential,
          "anthropic-version": "2023-06-01",
        },
      });
      if (!result.success) return result;

      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = responseSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };
      models.push(
        ...parsed.data.data.map((model) => ({
          id: model.id,
          provider: "ANTHROPIC" as const,
          capabilities: model.capabilities ?? null,
          maxInputTokens: model.max_input_tokens ?? null,
          maxTokens: model.max_tokens ?? null,
          ...(model.display_name !== undefined
            ? { displayName: model.display_name }
            : undefined),
          ...(model.created_at !== undefined
            ? { createdAt: model.created_at }
            : undefined),
        })),
      );

      if (!parsed.data.has_more) {
        return { success: true, models };
      }
      if (!parsed.data.last_id) {
        return { success: false, error: "provider_error" };
      }
      cursor = parsed.data.last_id;
    }

    return { success: false, error: "provider_error" };
  },
};
