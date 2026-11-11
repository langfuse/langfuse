import type {
  GatewayApiFamily,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";

/** OpenAI and Anthropic speak one API each; Bedrock, OpenRouter, xAI, Vercel and Vertex AI have their own hosts. */
export function isGatewayApiFamily(
  provider: GatewayProvider,
): provider is GatewayApiFamily {
  return provider === "OPENAI" || provider === "ANTHROPIC";
}
