import type { GatewayEnabledModel } from "@/src/features/ai-gateway/types/gatewayEnabledModel";

/**
 * The organization's enabled connections and their admin-enabled models. A
 * connection whose catalog couldn't be loaded lists no models, though keys can
 * still call them.
 */
export type GatewayEnabledModels = {
  models: GatewayEnabledModel[];
  connections: { name: string; isCatalogUnknown: boolean }[];
};
