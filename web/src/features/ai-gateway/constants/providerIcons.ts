import { SiAnthropic, SiOpenai } from "@langfuse/icons/si";

import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

export const providerIcons = {
  OPENAI: SiOpenai,
  ANTHROPIC: SiAnthropic,
} satisfies Record<GatewayProvider, typeof SiOpenai>;
