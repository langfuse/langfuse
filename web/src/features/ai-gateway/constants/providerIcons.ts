import { OpenRouterMark, XaiMark } from "@langfuse/icons/brand";
import {
  SiAmazonwebservices,
  SiAnthropic,
  SiOpenai,
  SiVercel,
} from "@langfuse/icons/si";
import { TbBrandAzure } from "@langfuse/icons/tb";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  BEDROCK: SiAmazonwebservices,
  OPENROUTER: OpenRouterMark,
  XAI: XaiMark,
  VERCEL: SiVercel,
  AZURE: TbBrandAzure,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
