import { getAvailableGatewayProviders } from "@/src/features/ai-gateway/fns/getAvailableGatewayProviders";
import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const HERO_PROVIDER_ORDER: GatewayProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "BEDROCK",
  "OPENROUTER",
  "XAI",
  "VERCEL",
  "VERTEX",
];

/** The providers the setup banner shows, in display order, with whether each is connected. */
export function getGatewaySetupHeroProviders(
  connectedProviders: Set<GatewayProvider>,
) {
  const availableProviders = new Set(getAvailableGatewayProviders());
  return HERO_PROVIDER_ORDER.filter((provider) =>
    availableProviders.has(provider),
  ).map((provider) => ({
    provider,
    isConnected: connectedProviders.has(provider),
  }));
}
