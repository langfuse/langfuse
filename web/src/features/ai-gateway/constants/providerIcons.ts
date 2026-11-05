import { BrandAmazonBedrock } from "@langfuse/icons/brands";
import { SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  BEDROCK: BrandAmazonBedrock,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
