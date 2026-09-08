import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

// Model API contract: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
const modelSchema = z.object({
  id: z.string(),
  canonical_slug: z.string(),
  name: z.string(),
  created: z.number().int().nonnegative().max(253_402_300_799),
});

const responseSchema = z.object({
  data: z.array(modelSchema),
  links: z.object({ next: z.string().nullable() }).optional(),
  total_count: z.number().int().nonnegative().optional(),
});

export const openRouterModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENROUTER");
    const catalogUrl = new URL(`${definition.baseUrl}${definition.modelsPath}`);
    const models: GatewayModelCatalogEntry[] = [];
    let pageUrl = catalogUrl;

    for (let page = 0; page < 100; page += 1) {
      const result = await requestJson({
        fetcher,
        url: pageUrl,
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!result.success) return result;

      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = responseSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };
      models.push(...parsed.data.data.map(toCatalogEntry));

      if (!parsed.data.links?.next) {
        return { success: true, models };
      }
      const nextUrl = new URL(parsed.data.links.next, catalogUrl);
      if (
        nextUrl.origin !== catalogUrl.origin ||
        nextUrl.pathname !== catalogUrl.pathname
      ) {
        return { success: false, error: "provider_error" };
      }
      pageUrl = nextUrl;
    }

    return { success: false, error: "provider_error" };
  },
};

function toCatalogEntry(
  model: z.infer<typeof modelSchema>,
): GatewayModelCatalogEntry {
  return {
    id: model.id,
    provider: "OPENROUTER",
    canonicalSlug: model.canonical_slug,
    displayName: model.name,
    createdAt: new Date(model.created * 1000).toISOString(),
  };
}
