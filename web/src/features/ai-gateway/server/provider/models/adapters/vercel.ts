import { z } from "zod/v4";

import {
  type GatewayApiFormat,
  getGatewayProviderDefinition,
} from "@/src/features/ai-gateway/server/provider/registry";
import { requestJson, standardHttpError } from "./shared";
import type { ModelDiscoveryAdapter } from "../types";

// API contract: `GET /v1/models` in https://vercel.com/docs/ai-gateway/sdks-and-apis/rest-api
const responseSchema = z.object({ data: z.array(z.unknown()) });

// The catalog also lists image and other models the gateway cannot route. Chat
// Completions, Responses and Messages serve every language model, Embeddings
// every embedding model, and Decisions every decision model, which Vercel is
// renaming from `evaluation` to `decision`.
const modelApiFormats = {
  language: [
    "openai.responses",
    "openai.chat-completions",
    "anthropic.messages",
  ],
  embedding: ["openai.embeddings"],
  evaluation: ["openai.decisions"],
  decision: ["openai.decisions"],
} as const satisfies Record<string, readonly GatewayApiFormat[]>;

const routableModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(["language", "embedding", "evaluation", "decision"]),
  // `created` is the same for every model; `released` is the release date.
  released: z.number().int().nonnegative().max(253_402_300_799),
  // Epoch ms after which the model is removed. Undocumented, so a malformed
  // value must not drop the model.
  deprecated_at: z.number().int().nonnegative().nullish().catch(null),
  // `unknown` means Vercel could not evaluate the team's configuration, so
  // only `ineligible` excludes a model.
  model_eligibility: z.object({ status: z.string() }).nullish().catch(null),
});

// Entries are checked one by one so a single malformed entry, such as one of
// the team's own models, does not fail discovery.
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
    const available = parsed.data.data.flatMap((entry) => {
      const model = routableModelSchema.safeParse(entry);
      if (!model.success) return [];
      const { deprecated_at, model_eligibility } = model.data;
      const usable =
        (deprecated_at == null || deprecated_at > now) &&
        model_eligibility?.status !== "ineligible";
      return usable ? [model.data] : [];
    });
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
        apiFormats: [...modelApiFormats[model.type]],
      })),
      expiresAt: expiries.length > 0 ? Math.min(...expiries) : undefined,
    };
  },
};
