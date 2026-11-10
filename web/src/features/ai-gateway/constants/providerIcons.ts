import { OpenRouterMark } from "@langfuse/icons/brand";
import { SiAmazonwebservices, SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  BEDROCK: SiAmazonwebservices,
  OPENROUTER: OpenRouterMark,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
