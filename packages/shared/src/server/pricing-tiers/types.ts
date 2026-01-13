import { type Decimal } from "decimal.js";
import { PricingTierCondition } from "../../features/model-pricing";

/**
 * Shared types for pricing tier functionality
 * Used across Public API, tRPC, and internal services
 */

/**
 * Result of pricing tier matching
 */
export type PricingTierMatchResult = {
  pricingTierId: string;
  pricingTierName: string;
  prices: Record<string, Decimal>; // usageType -> price
};

/**
 * Pricing tier with prices included (from database)
 */
export type PricingTierWithPrices = {
  id: string;
  name: string;
  isDefault: boolean;
  priority: number;
  conditions: PricingTierCondition[];
  prices: Array<{
    usageType: string;
    price: Decimal;
  }>;
};
