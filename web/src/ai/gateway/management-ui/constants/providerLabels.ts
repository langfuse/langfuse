import type { GatewayProvider } from "@/src/ai/gateway/management-ui/types/gatewayProvider";

export const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
};
