import { postExternalGuardrailTest } from "@/src/features/ai-gateway/server/guardrails/postExternalGuardrailTest";
import type { GatewayLakeraGuardrailConfig } from "@/src/features/ai-gateway/types/gatewayGuardrail";

// Mirrors the gateway's `lakera::origin` region-to-host mapping.
const LAKERA_GUARD_ORIGINS = {
  eu: "https://eu.api.lakera.ai",
  us: "https://us.api.lakera.ai",
  "ap-southeast-1": "https://ap-southeast-1.api.lakera.ai",
} as const satisfies Record<GatewayLakeraGuardrailConfig["region"], string>;

/** Checks the key and project against Lakera Guard with one harmless message; throws `ProviderCredentialRejectedError` on rejection. */
export async function validateLakeraGuardrail(
  params: GatewayLakeraGuardrailConfig & { apiKey: string },
) {
  await postExternalGuardrailTest({
    url: `${LAKERA_GUARD_ORIGINS[params.region]}/v2/guard`,
    apiKey: params.apiKey,
    body: {
      messages: [{ role: "user", content: "Hello" }],
      ...(params.projectId ? { project_id: params.projectId } : {}),
    },
    providerName: "Lakera Guard",
    unreachableMessage: "Could not reach Lakera Guard in the selected region.",
    isExpectedResponse: (json) =>
      typeof (json as { flagged?: unknown } | null)?.flagged === "boolean",
  });
}
