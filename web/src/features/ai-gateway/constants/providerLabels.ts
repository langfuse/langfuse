import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  BEDROCK: "Amazon Bedrock",
  OPENROUTER: "OpenRouter",
  XAI: "xAI",
  VERCEL: "Vercel AI Gateway",
  VERTEX: "Google Vertex AI",
};
