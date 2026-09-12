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
    return {
      success: true,
      models: parsed.data.data.map((model) => ({
        id: model.id,
        provider: "OPENAI" as const,
        canonicalSlug: model.id,
        displayName: model.id,
        createdAt: new Date(model.created * 1000).toISOString(),
      })),
    };
  },
};
