import { z } from "zod/v4";

import { getGatewayProviderDefinition } from "@/src/features/llm-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { GatewayModelCatalogEntry, ModelDiscoveryAdapter } from "../types";

// Model API contract: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
// Anthropic Messages compatibility: https://openrouter.ai/docs/api/api-reference/anthropic-messages/create-a-message
const modelSchema = z.looseObject({
  id: z.string(),
  name: z.string().optional(),
  created: z.number().optional(),
  expiration_date: z.string().nullable().optional(),
  context_length: z.number().nullable().optional(),
  architecture: z
    .looseObject({
      input_modalities: z.array(z.string()).optional(),
    })
    .optional(),
  supported_parameters: z.array(z.string()).optional(),
  top_provider: z
    .looseObject({
      max_completion_tokens: z.number().nullable().optional(),
    })
    .nullable()
    .optional(),
  reasoning: z.record(z.string(), z.unknown()).nullable().optional(),
});

const responseSchema = z.object({
  data: z.array(modelSchema),
  links: z.object({ next: z.string().nullable() }).optional(),
  total_count: z.number().int().nonnegative().optional(),
});

export const openRouterModelDiscoveryAdapter: ModelDiscoveryAdapter = {
  async fetchCatalog({ credential, fetcher }) {
    const definition = getGatewayProviderDefinition("OPENROUTER");
    const catalogUrl = new URL(`${definition.baseUrl}${definition.modelsPath}`);
    const models: GatewayModelCatalogEntry[] = [];
    let pageUrl = catalogUrl;

    for (let page = 0; page < 100; page += 1) {
      const result = await requestJson({
        fetcher,
        url: pageUrl,
        headers: { Authorization: `Bearer ${credential}` },
      });
      if (!result.success) return result;

      const error = standardHttpError(result.response);
      if (error) return { success: false, error };

      const parsed = responseSchema.safeParse(result.value);
      if (!parsed.success) return { success: false, error: "provider_error" };
      models.push(...parsed.data.data.map(toCatalogEntry));

      if (!parsed.data.links?.next) {
        return { success: true, models };
      }
      const nextUrl = new URL(parsed.data.links.next, catalogUrl);
      if (
        nextUrl.origin !== catalogUrl.origin ||
        nextUrl.pathname !== catalogUrl.pathname
      ) {
        return { success: false, error: "provider_error" };
      }
      pageUrl = nextUrl;
    }

    return { success: false, error: "provider_error" };
  },
};

function toCatalogEntry(
  model: z.infer<typeof modelSchema>,
): GatewayModelCatalogEntry {
  const createdAt = toIsoDate(model.created);
  return {
    id: model.id,
    provider: "OPENROUTER",
    nativeModel: model,
    capabilities: toAnthropicCapabilities(model),
    maxInputTokens: model.context_length ?? null,
    maxTokens: model.top_provider?.max_completion_tokens ?? null,
    ...(model.created !== undefined ? { created: model.created } : undefined),
    ...(model.expiration_date !== undefined
      ? { shutdownDate: model.expiration_date }
      : undefined),
    ...(model.name !== undefined ? { displayName: model.name } : undefined),
    ...(createdAt ? { createdAt } : undefined),
  };
}

function toAnthropicCapabilities(
  model: z.infer<typeof modelSchema>,
): Record<string, unknown> | null {
  const parameters = new Set(model.supported_parameters ?? []);
  const inputModalities = new Set(model.architecture?.input_modalities ?? []);
  if (parameters.size === 0 && inputModalities.size === 0 && !model.reasoning) {
    return null;
  }

  const supports = (name: string) => ({ supported: parameters.has(name) });
  const reasoningSupported =
    parameters.has("reasoning") || Boolean(model.reasoning);
  return {
    batch: supports("batch"),
    citations: supports("citations"),
    code_execution: supports("code_execution"),
    context_management: {
      supported: parameters.has("context_management"),
      clear_thinking_20251015: null,
      clear_tool_uses_20250919: null,
      compact_20260112: null,
    },
    effort: {
      supported: reasoningSupported,
      high: { supported: reasoningSupported },
      low: { supported: reasoningSupported },
      max: { supported: reasoningSupported },
      medium: { supported: reasoningSupported },
      xhigh: null,
    },
    image_input: { supported: inputModalities.has("image") },
    pdf_input: { supported: inputModalities.has("file") },
    structured_outputs: {
      supported:
        parameters.has("structured_outputs") ||
        parameters.has("response_format"),
    },
    thinking: {
      supported: reasoningSupported,
      types: {
        adaptive: { supported: reasoningSupported },
        enabled: { supported: reasoningSupported },
      },
    },
  };
}

function toIsoDate(unixSeconds: number | undefined): string | undefined {
  if (unixSeconds === undefined) return undefined;
  try {
    return new Date(unixSeconds * 1000).toISOString();
  } catch {
    return undefined;
  }
}
