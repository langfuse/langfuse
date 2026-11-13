import { AzureMark, OpenRouterMark, XaiMark } from "@langfuse/icons/brand";
import {
  SiAmazonwebservices,
  SiAnthropic,
  SiGooglecloud,
  SiGooglegemini,
  SiOpenai,
  SiVercel,
} from "@langfuse/icons/si";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  BEDROCK: SiAmazonwebservices,
  OPENROUTER: OpenRouterMark,
  XAI: XaiMark,
  VERCEL: SiVercel,
  AZURE: AzureMark,
  GOOGLE_AI_STUDIO: SiGooglegemini,
  VERTEX: SiGooglecloud,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
