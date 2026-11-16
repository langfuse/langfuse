import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerLabels: Record<GatewayProvider, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Anthropic",
  BEDROCK: "Amazon Bedrock",
  OPENROUTER: "OpenRouter",
  XAI: "xAI",
  VERCEL: "Vercel AI Gateway",
  AZURE: "Microsoft Azure",
  GOOGLE_AI_STUDIO: "Google AI Studio",
  VERTEX: "Google Vertex AI",
};
