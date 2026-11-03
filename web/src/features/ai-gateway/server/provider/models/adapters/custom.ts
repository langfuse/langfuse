import { z } from "zod/v4";

import { validateLlmConnectionBaseURL } from "@langfuse/shared/src/server";

import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// vLLM, SGLang, and other OpenAI-compatible servers serve the OpenAI
// `/models` shape: https://platform.openai.com/docs/api-reference/models/list
const responseSchema = z.object({
  data: z.array(
    z.object({
      id: z.string(),
      created: z.number().int().nonnegative().max(253_402_300_799).optional(),
    }),
  ),
});

export const customModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, baseUrl, fetcher }) {
    if (!baseUrl) return { success: false, error: "provider_error" };
    // Re-validate: the allowlist or DNS may have changed since save.
    try {
      await validateLlmConnectionBaseURL(baseUrl);
    } catch {
      return { success: false, error: "provider_error" };
    }
    const result = await requestJson({
      fetcher,
      url: new URL(`${baseUrl}/models`),
      headers: credential ? { Authorization: `Bearer ${credential}` } : {},
      customOrigin: true,
    });
    if (!result.success) return result;
    const error = standardHttpError(result.response);
    if (error) return { success: false, error };
    const parsed = responseSchema.safeParse(result.value);
    if (!parsed.success) {
      return { success: false, error: "provider_error", invalidBody: true };
    }
    return {
      success: true,
      models: parsed.data.data.map((model) => ({
        id: model.id,
        provider: "CUSTOM" as const,
        canonicalSlug: model.id,
        displayName: model.id,
        createdAt: new Date((model.created ?? 0) * 1000).toISOString(),
      })),
    };
  },
};
