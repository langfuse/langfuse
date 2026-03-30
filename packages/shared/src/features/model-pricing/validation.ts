import safeRegex from "safe-regex2";
import { z } from "zod";

/**
 * Shared validation for pricing tier regex patterns and conditions
 * Used by both Public API and tRPC routes
 */

const MAX_PATTERN_LENGTH = 200;
const MAX_TIER_NAME_LENGTH = 100;
const MAX_TIER_PRIORITY = 999;

/**
 * Validates a regex pattern for safety and correctness
 * @throws Error with descriptive message if pattern is invalid
 */
export function validateRegexPattern(pattern: string): void {
  // Length check
  if (pattern.length > MAX_PATTERN_LENGTH) {
    throw new Error(
      `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`,
    );
  }

  // Check for empty pattern
  if (pattern.length === 0) {
    throw new Error("Pattern cannot be empty");
  }

  // Syntax check
  try {
    new RegExp(pattern);
  } catch (e) {
    throw new Error(
      `Invalid regex syntax: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  // Safety check (catastrophic backtracking)
  if (!safeRegex(pattern)) {
    throw new Error(
      "Pattern may cause catastrophic backtracking. Please simplify your regex.",
    );
  }
}

/**
 * Pricing tier condition schema (shared across API and tRPC)
 */
export const PricingTierConditionSchema = z.object({
  usageDetailPattern: z
    .string()
    .min(1, "Pattern cannot be empty")
    .max(
      MAX_PATTERN_LENGTH,
      `Pattern exceeds maximum length of ${MAX_PATTERN_LENGTH} characters`,
    )
    .refine(
      (pattern) => {
        try {
          validateRegexPattern(pattern);
          return true;
        } catch {
          return false;
        }
      },
      {
        message:
          "Invalid regex pattern: must be valid regex and not cause catastrophic backtracking",
      },
    ),
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
  value: z.number().nonnegative(),
  caseSensitive: z.boolean().default(false),
});

export type PricingTierCondition = z.infer<typeof PricingTierConditionSchema>;

/**
 * Pricing tier input schema (for creation - no ID)
 * Used when creating new tiers via API or tRPC
 */
export const PricingTierInputSchema = z.object({
  name: z
    .string()
    .min(1, "Name cannot be empty")
    .max(
      MAX_TIER_NAME_LENGTH,
      `Name exceeds maximum length of ${MAX_TIER_NAME_LENGTH} characters`,
    ),
  isDefault: z.boolean().default(false),
  priority: z
    .number()
    .int("Priority must be an integer")
    .min(0, "Priority must be non-negative")
    .max(MAX_TIER_PRIORITY, `Priority cannot exceed ${MAX_TIER_PRIORITY}`),
  conditions: z.array(PricingTierConditionSchema),
  upTo: z
    .number()
    .int("upTo must be an integer")
    .positive("upTo must be positive")
    .nullish()
    .default(null),
  prices: z.record(
    z.string(),
    z.number().nonnegative("Price must be non-negative"),
  ),
});

export type PricingTierInput = z.infer<typeof PricingTierInputSchema>;

/**
 * Validates an array of pricing tiers
 * Ensures:
 * - Exactly one default tier
 * - Unique priorities
 * - Unique names
 * - Default tier has priority 0 and empty conditions
 */
export function validatePricingTiers(
  tiers: PricingTierInput[],
): { valid: true } | { valid: false; error: string } {
  if (tiers.length === 0) {
    return { valid: false, error: "At least one pricing tier is required" };
  }

  // Check for exactly one default tier
  const defaultTiers = tiers.filter((t) => t.isDefault);
  if (defaultTiers.length === 0) {
    return {
      valid: false,
      error: "Exactly one pricing tier must have isDefault: true",
    };
  }
  if (defaultTiers.length > 1) {
    return {
      valid: false,
      error:
        "Only one pricing tier can have isDefault: true, found " +
        defaultTiers.length,
    };
  }

  // Validate default tier has priority 0 and empty conditions
  const defaultTier = defaultTiers[0];
  if (defaultTier.priority !== 0) {
    return {
      valid: false,
      error: "Default pricing tier must have priority: 0",
    };
  }
  if (defaultTier.conditions.length > 0) {
    return {
      valid: false,
      error: "Default pricing tier must have empty conditions array",
    };
  }

  // Validate non-default tiers have at least 1 condition
  for (const tier of tiers) {
    if (!tier.isDefault && tier.conditions.length === 0) {
      return {
        valid: false,
        error: `Non-default pricing tier "${tier.name}" must have at least one condition`,
      };
    }
  }

  // Check for unique priorities
  const priorities = tiers.map((t) => t.priority);
  const uniquePriorities = new Set(priorities);
  if (priorities.length !== uniquePriorities.size) {
    return {
      valid: false,
      error: "Pricing tier priorities must be unique within a model",
    };
  }

  // Check for unique names
  const names = tiers.map((t) => t.name);
  const uniqueNames = new Set(names);
  if (names.length !== uniqueNames.size) {
    return { valid: false, error: "Pricing tier names must be unique" };
  }

  // Validate all conditions have valid regex patterns
  for (const tier of tiers) {
    for (const condition of tier.conditions) {
      try {
        validateRegexPattern(condition.usageDetailPattern);
      } catch (error) {
        return {
          valid: false,
          error: `Invalid regex pattern in tier "${tier.name}": ${
            error instanceof Error ? error.message : String(error)
          }`,
        };
      }
    }
  }

  // Validate graduated pricing tiers (upTo)
  const tiersWithUpTo = tiers.filter((t) => t.upTo != null);
  if (tiersWithUpTo.length > 0) {
    // If any tier uses upTo, all non-final tiers must have upTo set
    const sortedByPriority = [...tiers].sort((a, b) => a.priority - b.priority);
    const lastTier = sortedByPriority[sortedByPriority.length - 1];

    for (const tier of sortedByPriority) {
      if (tier === lastTier) {
        // Last tier (highest priority) must have upTo=null (unlimited)
        if (tier.upTo != null) {
          return {
            valid: false,
            error: `The last graduated pricing tier "${tier.name}" (highest priority) must have upTo: null (unlimited)`,
          };
        }
      } else {
        // All other tiers must have upTo set
        if (tier.upTo == null) {
          return {
            valid: false,
            error: `Graduated pricing tier "${tier.name}" must have upTo defined (only the last tier can have upTo: null)`,
          };
        }
      }
    }

    // Validate upTo values are in ascending order by priority
    const upToValues = sortedByPriority
      .filter((t) => t.upTo != null)
      .map((t) => t.upTo!);
    for (let i = 1; i < upToValues.length; i++) {
      if (upToValues[i] <= upToValues[i - 1]) {
        return {
          valid: false,
          error:
            "Graduated pricing tier upTo values must be strictly ascending by priority",
        };
      }
    }
  }

  // Validate all tiers have at least one price
  for (const tier of tiers) {
    if (Object.keys(tier.prices).length === 0) {
      return {
        valid: false,
        error: `Pricing tier "${tier.name}" must have at least one price defined`,
      };
    }
  }

  // Validate all tiers have the same usage keys
  if (tiers.length > 1) {
    const defaultTierForKeys = tiers.find((t) => t.isDefault);
    if (!defaultTierForKeys) {
      return { valid: false, error: "No default tier found" };
    }

    const defaultKeys = Object.keys(defaultTierForKeys.prices).sort();

    for (const tier of tiers) {
      if (tier.isDefault) continue;

      const tierKeys = Object.keys(tier.prices).sort();

      // Check if keys match
      if (
        defaultKeys.length !== tierKeys.length ||
        !defaultKeys.every((key, index) => key === tierKeys[index])
      ) {
        return {
          valid: false,
          error: `Pricing tier "${tier.name}" must have the same usage keys as the default tier. Expected: [${defaultKeys.join(", ")}], Got: [${tierKeys.join(", ")}]`,
        };
      }
    }
  }

  return { valid: true };
}

/**
 * Validates that pricing tiers can be used with flat prices
 * Returns error if both are provided
 */
export function validatePricingMethod(params: {
  hasFlatPrices: boolean;
  hasPricingTiers: boolean;
}): { valid: true } | { valid: false; error: string } {
  const { hasFlatPrices, hasPricingTiers } = params;

  if (hasFlatPrices && hasPricingTiers) {
    return {
      valid: false,
      error:
        "Cannot provide both flat prices (inputPrice/outputPrice/totalPrice) and pricingTiers",
    };
  }

  if (!hasFlatPrices && !hasPricingTiers) {
    return {
      valid: false,
      error:
        "Must provide either flat prices (inputPrice/outputPrice/totalPrice) OR pricingTiers",
    };
  }

  return { valid: true };
}
