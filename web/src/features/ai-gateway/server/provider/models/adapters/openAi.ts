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
  async fetchCatalog({ credential, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENAI");
    const result = await requestJson({
      fetcher,
      url: new URL(`${definition.baseUrl}${definition.modelsPath}`),
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.success) return result;

    const error = standardHttpError(result.response);
    if (error) return { success: false, error };

    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) return { success: false, error: "provider_error" };
    const now = Date.now();
    return {
      success: true,
      models: parsed.data.data
        .filter((model) => !isShutDown(model.shutdown_date, now))
        .map((model) => ({
          id: model.id,
          provider: "OPENAI" as const,
          canonicalSlug: model.id,
          displayName: model.id,
          createdAt: new Date(model.created * 1000).toISOString(),
        })),
    };
  },
};

/** OpenAI keeps listing models past their shutdown date. An unparseable date keeps the model. */
function isShutDown(shutdownDate: string | null | undefined, now: number) {
  if (!shutdownDate) return false;
  return Date.parse(`${shutdownDate}T00:00:00Z`) < now;
}
