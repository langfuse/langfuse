import { findModel } from "@langfuse/shared/src/server";

import type { GatewayResolveResponse } from "@/src/features/ai-gateway/server/provider/registry";

/**
 * Prices the gateway charges the request's spend at. Matched on the model sent
 * upstream; Langfuse ingestion later matches on the model the provider
 * reports, which can pick a different model for the same request.
 */
export async function findResolvePricing(params: {
  projectId: string;
  providerModel: string;
}): Promise<GatewayResolveResponse["pricing"]> {
  const { model, pricingTiers } = await findModel({
    projectId: params.projectId,
    model: params.providerModel,
  });
  if (!model) return null;
  return {
    model_id: model.id,
    tiers: pricingTiers.map((tier) => ({
      id: tier.id,
      name: tier.name,
      is_default: tier.isDefault,
      priority: tier.priority,
      conditions: tier.conditions.map((condition) =>
        "source" in condition
          ? {
              source: condition.source,
              key: condition.key,
              values: condition.values,
            }
          : {
              usage_detail_pattern: condition.usageDetailPattern,
              operator: condition.operator,
              value: condition.value,
              case_sensitive: condition.caseSensitive,
            },
      ),
      prices: Object.fromEntries(
        tier.prices.map((price) => [price.usageType, price.price.toNumber()]),
      ),
    })),
  };
}
