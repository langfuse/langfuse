import type { GatewayProvider } from "@/src/features/llm-gateway/types/gatewayProvider";

export const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  OPENROUTER: "OpenRouter",
};
