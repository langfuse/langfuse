import { z } from "zod/v4";

import {
  type GatewayApiFormat,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

const UNKNOWN_CREATED_AT = new Date(0).toISOString();
const PAGE_SIZE = "200";
const MAX_PAGES = 20;
const SERVERLESS_FILTER = "supports_serverless=true";

const CHAT_API_FORMATS: readonly GatewayApiFormat[] = [
  "openai.responses",
  "openai.chat-completions",
  "anthropic.messages",
];
const EMBEDDING_API_FORMATS: readonly GatewayApiFormat[] = [
  "openai.embeddings",
];

// API contract: `GET /v1/accounts/{account_id}/models` in
// https://docs.fireworks.ai/api-reference/list-models
const responseSchema = z.object({
  models: z.array(z.unknown()).optional().default([]),
  nextPageToken: z.string().nullish(),
});

// `google.type.Date`; zero fields denote an omitted component, so only a full
// calendar date schedules a shutdown.
const deprecationDateSchema = z
  .object({
    year: z.number().int().min(1).max(9999),
    month: z.number().int().min(1).max(12),
    day: z.number().int().min(1).max(31),
  })
  .nullish()
  .catch(null);

const modelSchema = z.object({
  name: z.string().min(1),
  displayName: z.string().nullish().catch(null),
  createTime: z.string().nullish().catch(null),
  state: z.string().nullish().catch(null),
  kind: z.string().nullish().catch(null),
  conversationConfig: z.unknown().nullish().catch(null),
  deprecationDate: deprecationDateSchema,
});

type FireworksModel = z.infer<typeof modelSchema>;

// Lists Fireworks' public serverless models. Dedicated or account-owned models
// can still be added as custom models on the connection.
export const fireworksModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, extraHeaders, fetcher }) {
    const definition = getGatewayProviderDefinition("FIREWORKS");
    const headers = { ...extraHeaders, Authorization: `Bearer ${credential}` };
    const now = Date.now();
    const models: GatewayModelCatalogEntry[] = [];
    const expiries: number[] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const url = new URL(definition.modelsPath, definition.baseUrl);
      url.searchParams.set("filter", SERVERLESS_FILTER);
      url.searchParams.set("pageSize", PAGE_SIZE);
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const result = await requestJson({ fetcher, url, headers });
      if (!result.success) return result;

      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = responseSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };

      for (const entry of parsed.data.models) {
        const model = modelSchema.safeParse(entry);
        if (!model.success || model.data.state === "UPLOADING") continue;

        const apiFormats = getModelApiFormats(model.data);
        if (!apiFormats) continue;

        const expiresAt = parseDeprecationDate(model.data.deprecationDate);
        if (expiresAt !== null && expiresAt <= now) continue;
        if (expiresAt !== null) expiries.push(expiresAt);

        models.push({
          id: model.data.name,
          provider: "FIREWORKS",
          canonicalSlug: model.data.name,
          displayName: model.data.displayName || model.data.name,
          createdAt: toCreatedAt(model.data.createTime),
          apiFormats: [...apiFormats],
        });
      }

      if (!parsed.data.nextPageToken) {
        return {
          success: true,
          models,
          expiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
        };
      }
      pageToken = parsed.data.nextPageToken;
    }

    return { success: false, error: "provider_error" };
  },
};

function getModelApiFormats(
  model: FireworksModel,
): readonly GatewayApiFormat[] | null {
  if (model.kind === "EMBEDDING_MODEL") return EMBEDDING_API_FORMATS;
  if (
    model.kind !== "DRAFT_ADDON" &&
    model.conversationConfig !== null &&
    typeof model.conversationConfig === "object"
  ) {
    return CHAT_API_FORMATS;
  }
  return null;
}

function parseDeprecationDate(
  date: FireworksModel["deprecationDate"],
): number | null {
  if (!date) return null;
  const timestamp = Date.UTC(date.year, date.month - 1, date.day);
  const parsed = new Date(timestamp);
  if (
    parsed.getUTCFullYear() !== date.year ||
    parsed.getUTCMonth() !== date.month - 1 ||
    parsed.getUTCDate() !== date.day
  ) {
    return null;
  }
  return timestamp;
}

function toCreatedAt(createTime: string | null | undefined) {
  if (!createTime) return UNKNOWN_CREATED_AT;
  const timestamp = Date.parse(createTime);
  return Number.isNaN(timestamp)
    ? UNKNOWN_CREATED_AT
    : new Date(timestamp).toISOString();
}
