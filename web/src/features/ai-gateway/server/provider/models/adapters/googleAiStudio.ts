import { z } from "zod/v4";

import { isGeminiEmbeddingModel } from "@/src/features/ai-gateway/fns/isGeminiEmbeddingModel";
import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

const UNKNOWN_CREATED_AT = new Date(0).toISOString();
const MODEL_NAME_PREFIX = "models/";

// API contract: https://ai.google.dev/gemini-api/docs/openai#list-models
const responseSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
});

// The list also holds image, video, speech and Live API models, which neither
// Chat Completions nor Embeddings serve.
const CHAT_OR_EMBEDDING_MODEL = /^(gemini|gemma)-/;
const NON_CHAT_MODEL = /image|tts|live|audio|banana/;

export const googleAiStudioModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, fetcher }) {
    const definition = getGatewayProviderDefinition("GOOGLE_AI_STUDIO");
    const result = await requestJson({
      fetcher,
      url: new URL(`${definition.baseUrl}${definition.modelsPath}`),
      headers: { Authorization: `Bearer ${credential}` },
    });
    if (!result.success) return result;

    // Google rejects an invalid key with 400; the request carries nothing else.
    const error =
      result.response.status === 400
        ? "unauthorized"
        : standardHttpError(result.response);
    if (error) return { success: false, error };

    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) return { success: false, error: "provider_error" };
    return {
      success: true,
      models: parsed.data.data.flatMap(({ id: name }) => {
        // Listed as `models/{id}`; requests name the bare id.
        const id = name.startsWith(MODEL_NAME_PREFIX)
          ? name.slice(MODEL_NAME_PREFIX.length)
          : name;
        if (!CHAT_OR_EMBEDDING_MODEL.test(id)) return [];
        const embedding = isGeminiEmbeddingModel(id);
        if (!embedding && NON_CHAT_MODEL.test(id)) return [];
        return [
          {
            id,
            provider: "GOOGLE_AI_STUDIO" as const,
            canonicalSlug: id,
            displayName: id,
            createdAt: UNKNOWN_CREATED_AT,
            apiFormats: [
              embedding ? "openai.embeddings" : "openai.chat-completions",
            ],
          },
        ];
      }),
    };
  },
};
