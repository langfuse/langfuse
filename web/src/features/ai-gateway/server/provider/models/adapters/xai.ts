import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// API contract: `GET /v1/language-models` in https://docs.x.ai/openapi.json
const responseSchema = z.object({
  models: z.array(
    z.object({
      id: z.string(),
      created: z.number().int().nonnegative().max(253_402_300_799),
      aliases: z.array(z.string()).default([]),
    }),
  ),
});

// The list holds only the chat models the key can use. xAI has no deprecation
// or status field: a retired model is no longer listed. Aliases are listed as
// models of their own so model access can allow them.
export const xaiModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("XAI");
    const result = await requestJson({
      fetcher,
      url: new URL(`${definition.baseUrl}${definition.modelsPath}`),
      headers: { ...extraHeaders, Authorization: `Bearer ${credential}` },
    });
    if (!result.success) return result;

    // xAI rejects an invalid key with 400; the request carries nothing else. A
    // 403 is a valid key whose endpoint ACLs exclude listing models.
    if (result.response.status === 403) {
      return { success: true, models: [], modelListingDenied: true };
    }
    const error =
      result.response.status === 400
        ? "unauthorized"
        : standardHttpError(result.response);
    if (error) return { success: false, error };

    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) return { success: false, error: "provider_error" };
    return {
      success: true,
      models: parsed.data.models.flatMap((model) =>
        [model.id, ...model.aliases].map((id) => ({
          id,
          provider: "XAI" as const,
          canonicalSlug: model.id,
          displayName: id,
          createdAt: new Date(model.created * 1000).toISOString(),
        })),
      ),
    };
  },
};
