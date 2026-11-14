import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

const HERO_PROVIDER_ORDER: GatewayProvider[] = [
  "ANTHROPIC",
  "OPENAI",
  "BEDROCK",
  "OPENROUTER",
  "XAI",
  "VERCEL",
  "AZURE",
  "GOOGLE_AI_STUDIO",
  "VERTEX",
];

/** The providers the setup banner shows, in display order, with whether each is connected. */
export function getGatewaySetupHeroProviders(
  connectedProviders: Set<GatewayProvider>,
) {
  return HERO_PROVIDER_ORDER.map((provider) => ({
    provider,
    isConnected: connectedProviders.has(provider),
  }));
}
