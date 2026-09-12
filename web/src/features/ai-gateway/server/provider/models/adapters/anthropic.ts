import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

// API contract: https://platform.claude.com/docs/en/api/models/list
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      display_name: z.string(),
      created_at: z.iso.datetime(),
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
          canonicalSlug: model.id,
          displayName: model.display_name,
          createdAt: model.created_at,
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
