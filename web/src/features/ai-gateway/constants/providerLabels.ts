import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
};
