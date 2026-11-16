import type { GatewayProvider } from "@/src/features/ai-gateway/types/gatewayProvider";

/** A model an admin enabled on a provider connection, addressed as `connection:model`. */
export type GatewayEnabledModel = {
  slug: string;
  model: string;
  provider: GatewayProvider;
};
