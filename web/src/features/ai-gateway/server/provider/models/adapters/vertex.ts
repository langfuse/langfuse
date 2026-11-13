import { VertexTokenExchangeError } from "@langfuse/shared/src/server";
import { z } from "zod/v4";

import {
  GatewayVertexConfigSchema,
  getVertexAccessToken,
  vertexPublisherModelsUrl,
} from "@/src/features/ai-gateway/server/provider/vertex";
import { requestJson, standardHttpError } from "./shared";
import type {
  GatewayModelCatalogEntry,
  ModelDiscoveryAdapter,
  ModelDiscoveryError,
} from "../types";

const UNKNOWN_CREATED_AT = new Date(0).toISOString();
const PAGE_SIZE = "100";
const MAX_PAGES = 20;

// API contract: https://docs.cloud.google.com/vertex-ai/docs/reference/rest/v1beta1/publishers.models/list
const publisherModelsSchema = z.object({
  publisherModels: z
    .array(z.object({ name: z.string() }))
    .optional()
    .default([]),
  nextPageToken: z.string().optional(),
});

const MODEL_NAME_PREFIX = "publishers/google/models/";

// The list also holds embedding, image, speech and Live API models, which the
// Chat Completions endpoint does not serve.
const NON_CHAT_MODEL = /embedding|image|tts|live|audio|banana/;

// Only Google's Gemini models are listed. Partner and open models served by
// the same endpoint are added as custom models.
export const vertexModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, config, fetcher }) {
    const parsedConfig = GatewayVertexConfigSchema.safeParse(config);
    if (!parsedConfig.success) {
      return { success: false, error: "provider_error" };
    }
    let token: string;
    try {
      token = await getVertexAccessToken(credential);
    } catch (error) {
      return { success: false, error: tokenExchangeError(error) };
    }

    const models: GatewayModelCatalogEntry[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = vertexPublisherModelsUrl(parsedConfig.data);
      url.searchParams.set("pageSize", PAGE_SIZE);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const result = await requestJson({
        fetcher,
        url,
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!result.success) return result;
      const error = standardHttpError(result.response);
      if (error) return { success: false, error };
      const parsed = publisherModelsSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };

      for (const { name } of parsed.data.publisherModels) {
        const id = name.startsWith(MODEL_NAME_PREFIX)
          ? name.slice(MODEL_NAME_PREFIX.length)
          : null;
        if (!id?.startsWith("gemini-") || NON_CHAT_MODEL.test(id)) continue;
        models.push({
          id: `google/${id}`,
          provider: "VERTEX",
          canonicalSlug: `google/${id}`,
          displayName: id,
          createdAt: UNKNOWN_CREATED_AT,
        });
      }

      if (!parsed.data.nextPageToken) return { success: true, models };
      pageToken = parsed.data.nextPageToken;
    }
    return { success: false, error: "provider_error" };
  },
};

// Only an answer from Google rejects the key; an unreachable token endpoint
// must not mark the connection as errored.
function tokenExchangeError(error: unknown): ModelDiscoveryError {
  if (!(error instanceof VertexTokenExchangeError)) return "unauthorized";
  const { status } = error;
  if (status === null) return "timeout";
  if (status === 429) return "rate_limited";
  return status >= 500 ? "provider_error" : "unauthorized";
}
