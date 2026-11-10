import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { parseShutdownDate } from "./openAi";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// Every model the gateway lists must serve all of its routes.
const GATEWAY_ENDPOINTS = [
  "/api/v1/chat/completions",
  "/api/v1/messages",
  "/api/v1/responses",
];

// API contract: `listModelsUser` in https://openrouter.ai/openapi.json
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      created: z.number().int().nonnegative().max(253_402_300_799),
      endpoints: z.array(z.string()).catch([]),
      // `YYYY-MM-DD` after which the model may be removed. A malformed value must not fail discovery.
      expiration_date: z.string().nullish().catch(null),
    }),
  ),
});

// The user endpoint applies the key's provider preferences and privacy settings.
// OpenRouter has no model status field: `endpoints` says which routes serve a
// model and `expiration_date` when it may be removed.
export const openRouterModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENROUTER");
    const result = await requestJson({
      fetcher,
      url: new URL(`${definition.baseUrl}${definition.modelsPath}`),
      headers: { ...extraHeaders, Authorization: `Bearer ${credential}` },
    });
    if (!result.success) return result;

    const error = standardHttpError(result.response);
    if (error) return { success: false, error };

    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) return { success: false, error: "provider_error" };
    const now = Date.now();
    const available = parsed.data.data
      .map((model) => ({
        model,
        expiresAt: parseShutdownDate(model.expiration_date),
      }))
      .filter(
        ({ model, expiresAt }) =>
          (expiresAt === null || expiresAt > now) &&
          GATEWAY_ENDPOINTS.every((endpoint) =>
            model.endpoints.includes(endpoint),
          ),
      );
    const expiries = available.flatMap(({ expiresAt }) =>
      expiresAt === null ? [] : [expiresAt],
    );
    return {
      success: true,
      models: available.map(({ model }) => ({
        id: model.id,
        provider: "OPENROUTER" as const,
        canonicalSlug: model.id,
        displayName: model.name,
        createdAt: new Date(model.created * 1000).toISOString(),
      })),
      expiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
    };
  },
};
