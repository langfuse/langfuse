import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// API contract: `GET /v1/models` in https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: z.string(),
      // `created` is the same for every model; `released` is the release date.
      released: z.number().int().nonnegative().max(253_402_300_799),
      // Epoch ms after which the model is removed. Undocumented, so a
      // malformed value must not fail discovery.
      deprecated_at: z.number().int().nonnegative().nullish().catch(null),
    }),
  ),
});

// The catalog also lists embedding, image and other models the gateway cannot
// route; Chat Completions, Responses and Messages serve every language model.
export const vercelModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("VERCEL");
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
    const available = parsed.data.data.filter(
      (model) =>
        model.type === "language" &&
        (model.deprecated_at == null || model.deprecated_at > now),
    );
    const expiries = available.flatMap(({ deprecated_at }) =>
      deprecated_at == null ? [] : [deprecated_at],
    );
    return {
      success: true,
      models: available.map((model) => ({
        id: model.id,
        provider: "VERCEL" as const,
        canonicalSlug: model.id,
        displayName: model.name,
        createdAt: new Date(model.released * 1000).toISOString(),
      })),
      expiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
    };
  },
};
