import type {
  GatewayCustomEndpointProvider,
  GatewayProvider,
} from "@/src/features/ai-gateway/types/gatewayProvider";
import { isGatewayApiFamily } from "@/src/features/ai-gateway/fns/isGatewayApiFamily";

/**
 * OpenAI and Anthropic connections may point at a compatible proxy, and
 * OpenRouter connections at another OpenRouter endpoint such as its EU one.
 */
export function supportsCustomEndpoint(
  provider: GatewayProvider,
): provider is GatewayCustomEndpointProvider {
  return isGatewayApiFamily(provider) || provider === "OPENROUTER";
}
