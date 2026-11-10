import { providerLabels } from "@/src/features/ai-gateway/constants/providerLabels";
import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";

/** The available provider names as one phrase, e.g. "OpenAI, Anthropic, or Amazon Bedrock". */
export function formatAvailableGatewayProviderNames() {
  return new Intl.ListFormat("en", { type: "disjunction" }).format(
    getAvailableGatewayProviders().map((provider) => providerLabels[provider]),
  );
}
