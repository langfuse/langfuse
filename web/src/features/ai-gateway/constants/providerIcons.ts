import { SiAnthropic, SiOpenai, SiServerless } from "@langfuse/icons/si";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
  CUSTOM: SiServerless,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
