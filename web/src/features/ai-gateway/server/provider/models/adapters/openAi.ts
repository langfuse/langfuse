import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// API contract: https://developers.openai.com/api/reference/resources/models/methods/list
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      created: z.number().int().nonnegative().max(253_402_300_799),
      // `YYYY-MM-DD`, or null when no shutdown is scheduled. A malformed value must not fail discovery.
      shutdown_date: z.string().nullish().catch(null),
    }),
  ),
});

export const openAiModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, baseURL, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENAI");
    const result = await requestJson({
      fetcher,
      url: new URL(`${baseURL ?? definition.baseUrl}${definition.modelsPath}`),
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
        shutdownAt: parseShutdownDate(model.shutdown_date),
      }))
      .filter(({ shutdownAt }) => shutdownAt === null || shutdownAt > now);
    const shutdowns = available.flatMap(({ shutdownAt }) =>
      shutdownAt === null ? [] : [shutdownAt],
    );
    return {
      success: true,
      models: available.map(({ model }) => ({
        id: model.id,
        provider: "OPENAI" as const,
        canonicalSlug: model.id,
        displayName: model.id,
        createdAt: new Date(model.created * 1000).toISOString(),
      })),
      expiresAt: shutdowns.length > 0 ? Math.min(...shutdowns) : undefined,
    };
  },
};

/** OpenAI keeps listing models past their shutdown date. Returns null for a missing or unparsable date. */
function parseShutdownDate(shutdownDate: string | null | undefined) {
  if (!shutdownDate) return null;
  const shutdownAt = Date.parse(`${shutdownDate}T00:00:00Z`);
  return Number.isNaN(shutdownAt) ? null : shutdownAt;
}
