import { SiAmazonwebservices, SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import { TbRoute } from "@langfuse/icons/tb";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  BEDROCK: SiAmazonwebservices,
  OPENROUTER: TbRoute,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
