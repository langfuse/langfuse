import { InvalidRequestError } from "@langfuse/shared";

import { ProviderCredentialRejectedError } from "@/src/features/ai-gateway/server/provider/connection/ProviderCredentialRejectedError";
import { getGatewayFetch } from "@/src/features/ai-gateway/server/provider/getGatewayFetch";
import type { GatewayOpenAiModerationGuardrailConfig } from "@/src/features/ai-gateway/types/gatewayGuardrail";

// Mirrors the gateway's region-to-host mapping in `guardrails/openai_moderation.rs`.
const OPENAI_MODERATION_ORIGINS = {
  us: "https://api.openai.com",
  eu: "https://eu.api.openai.com",
} as const satisfies Record<
  GatewayOpenAiModerationGuardrailConfig["region"],
  string
>;
const TEST_TIMEOUT_MS = 10_000;
const TEST_FAILED_MESSAGE = "Guardrail test failed";

/** Checks the key against OpenAI Moderation with one harmless input; throws `ProviderCredentialRejectedError` on rejection. */
export async function validateOpenAiModerationGuardrail(
  params: GatewayOpenAiModerationGuardrailConfig & { apiKey: string },
) {
  const fetcher = getGatewayFetch({
    baseURL: null,
    extraHeaders: {},
    logContext: "AI Gateway OpenAI moderation guardrail validation",
  });

  let response: Response;
  try {
    response = await fetcher(
      `${OPENAI_MODERATION_ORIGINS[params.region]}/v1/moderations`,
      {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        headers: {
          authorization: `Bearer ${params.apiKey}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: ["Hello"],
        }),
      },
    );
  } catch (error) {
    if (error instanceof InvalidRequestError) throw error;
    throw new ProviderCredentialRejectedError(
      { status: null, body: "Could not reach the OpenAI Moderation API." },
      TEST_FAILED_MESSAGE,
    );
  }

  const body = await response.text().catch(() => "");
  if (!response.ok) {
    throw new ProviderCredentialRejectedError(
      {
        status: response.status,
        body: body || response.statusText || "OpenAI rejected the request.",
      },
      TEST_FAILED_MESSAGE,
    );
  }

  let results: unknown;
  try {
    results = (JSON.parse(body) as { results?: unknown }).results;
  } catch {
    results = null;
  }
  if (!Array.isArray(results) || results.length !== 1) {
    throw new ProviderCredentialRejectedError(
      {
        status: response.status,
        body: "Unexpected response from the OpenAI Moderation API.",
      },
      TEST_FAILED_MESSAGE,
    );
  }
}
