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

const EMBEDDINGS_ENDPOINT = "/api/v1/embeddings";
const EMBEDDINGS_MODELS_PATH = "/embeddings/models";
const EMBEDDINGS_API_FORMATS = ["openai.embeddings"] as const;
// The chat listing waits for the optional embeddings listing, so it gets less time.
const EMBEDDINGS_TIMEOUT_MS = 3_000;

// API contract: `listModelsUser` and `listEmbeddingsModels` in https://openrouter.ai/openapi.json
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
  async fetchCatalog({ credential, baseURL, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENROUTER");
    const apiBaseUrl = baseURL ?? definition.baseUrl;
    const headers = { ...extraHeaders, Authorization: `Bearer ${credential}` };
    const [result, embeddings] = await Promise.all([
      requestJson({
        fetcher,
        url: new URL(`${apiBaseUrl}${definition.modelsPath}`),
        headers,
      }),
      requestJson({
        fetcher,
        url: new URL(`${apiBaseUrl}${EMBEDDINGS_MODELS_PATH}`),
        headers,
        timeoutMs: EMBEDDINGS_TIMEOUT_MS,
      }),
    ]);
    if (!result.success) return result;

    const error = standardHttpError(result.response);
    if (error) return { success: false, error };

    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) return { success: false, error: "provider_error" };
    const now = Date.now();
    const chatModels = parsed.data.data.filter((model) =>
      GATEWAY_ENDPOINTS.every((endpoint) => model.endpoints.includes(endpoint)),
    );
    const chatModelIds = new Set(chatModels.map(({ id }) => id));
    const available = [
      ...chatModels.map((model) => ({ model, apiFormats: undefined })),
      ...parseEmbeddingModels(embeddings)
        .filter(({ id }) => !chatModelIds.has(id))
        .map((model) => ({ model, apiFormats: EMBEDDINGS_API_FORMATS })),
    ]
      .map((entry) => ({
        ...entry,
        expiresAt: parseShutdownDate(entry.model.expiration_date),
      }))
      .filter(({ expiresAt }) => expiresAt === null || expiresAt > now);
    const expiries = available.flatMap(({ expiresAt }) =>
      expiresAt === null ? [] : [expiresAt],
    );
    return {
      success: true,
      models: available.map(({ model, apiFormats }) => ({
        id: model.id,
        provider: "OPENROUTER" as const,
        canonicalSlug: model.id,
        displayName: model.name,
        createdAt: new Date(model.created * 1000).toISOString(),
        ...(apiFormats && { apiFormats: [...apiFormats] }),
      })),
      expiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
    };
  },
};

// The embeddings catalog is global and has no per-key variant. Embedding models
// are an addition to the chat catalog, so a failed listing only omits them.
function parseEmbeddingModels(result: Awaited<ReturnType<typeof requestJson>>) {
  if (!result.success || !result.response.ok) return [];
  const parsed = responseSchema.safeParse(result.value);
  if (!parsed.success) return [];
  return parsed.data.data.filter((model) =>
    model.endpoints.includes(EMBEDDINGS_ENDPOINT),
  );
}
