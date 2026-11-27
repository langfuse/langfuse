import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

const UNKNOWN_CREATED_AT = new Date(0).toISOString();
// Unix seconds. A missing or malformed value must not fail discovery.
const unixTimestampSchema = z
  .number()
  .int()
  .nonnegative()
  .max(253_402_300_799)
  .optional()
  .catch(undefined);

// API contract: https://developers.openai.com/api/reference/resources/models/methods/list
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      created: unixTimestampSchema,
      // Classic Azure OpenAI resources (`<resource>.openai.azure.com/openai/v1`) send `created_at` instead of `created`.
      created_at: unixTimestampSchema,
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
        createdAt: toCreatedAt(model.created ?? model.created_at),
      })),
      expiresAt: shutdowns.length > 0 ? Math.min(...shutdowns) : undefined,
    };
  },
};

function toCreatedAt(createdSeconds: number | undefined) {
  return createdSeconds === undefined
    ? UNKNOWN_CREATED_AT
    : new Date(createdSeconds * 1000).toISOString();
}

/** Providers keep listing models past their shutdown date. Returns null for a missing or unparsable date. */
export function parseShutdownDate(shutdownDate: string | null | undefined) {
  if (!shutdownDate) return null;
  const shutdownAt = Date.parse(`${shutdownDate}T00:00:00Z`);
  return Number.isNaN(shutdownAt) ? null : shutdownAt;
}
