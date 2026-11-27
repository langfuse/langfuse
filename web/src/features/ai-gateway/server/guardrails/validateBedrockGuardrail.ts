import { postExternalGuardrailTest } from "@/src/features/ai-gateway/server/guardrails/postExternalGuardrailTest";
import { bedrockRuntimeOrigin } from "@/src/features/ai-gateway/server/provider/bedrock";
import type { GatewayBedrockGuardrailConfig } from "@/src/features/ai-gateway/types/gatewayGuardrail";

/** Checks the key and guardrail against Bedrock `ApplyGuardrail` with one harmless input; throws `ProviderCredentialRejectedError` on rejection. */
export async function validateBedrockGuardrail(
  params: GatewayBedrockGuardrailConfig & { apiKey: string },
) {
  const origin = bedrockRuntimeOrigin({ region: params.region });
  await postExternalGuardrailTest({
    url: `${origin}/guardrail/${encodeURIComponent(params.guardrailId)}/version/${encodeURIComponent(params.guardrailVersion)}/apply`,
    apiKey: params.apiKey,
    body: { source: "INPUT", content: [{ text: { text: "Hello" } }] },
    providerName: "Amazon Bedrock",
    unreachableMessage:
      "Could not reach Amazon Bedrock in the selected region.",
    isExpectedResponse: (json) => {
      const action = (json as { action?: unknown } | null)?.action;
      return action === "NONE" || action === "GUARDRAIL_INTERVENED";
    },
  });
}
