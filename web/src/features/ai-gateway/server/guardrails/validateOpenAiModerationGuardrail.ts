import { postExternalGuardrailTest } from "@/src/features/ai-gateway/server/guardrails/postExternalGuardrailTest";
import type { GatewayOpenAiModerationGuardrailConfig } from "@/src/features/ai-gateway/types/gatewayGuardrail";

// Mirrors the gateway's `moderation_origin` region-to-host mapping.
const OPENAI_MODERATION_ORIGINS = {
  us: "https://api.openai.com",
  eu: "https://eu.api.openai.com",
} as const satisfies Record<
  GatewayOpenAiModerationGuardrailConfig["region"],
  string
>;

/** Checks the key against OpenAI Moderation with one harmless input; throws `ProviderCredentialRejectedError` on rejection. */
export async function validateOpenAiModerationGuardrail(
  params: GatewayOpenAiModerationGuardrailConfig & { apiKey: string },
) {
  await postExternalGuardrailTest({
    url: `${OPENAI_MODERATION_ORIGINS[params.region]}/v1/moderations`,
    apiKey: params.apiKey,
    body: { model: "omni-moderation-latest", input: ["Hello"] },
    providerName: "OpenAI",
    unreachableMessage: "Could not reach the OpenAI Moderation API.",
    isExpectedResponse: (json) => {
      const results = (json as { results?: unknown } | null)?.results;
      return Array.isArray(results) && results.length === 1;
    },
  });
}
