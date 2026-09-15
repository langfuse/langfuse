import safeRegex from "safe-regex2";
import { z } from "zod";

/**
 * Shared validation for pricing tier regex patterns and conditions
 * Used by both Public API and tRPC routes
 */

/**
 * Validates a regex pattern for safety and correctness
 * @throws Error with descriptive message if pattern is invalid
 */
export function validateRegexPattern(pattern: string): void {
  // Length check
  if (pattern.length > 200) {
    throw new Error("Pattern exceeds maximum length of 200 characters");
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

const UsageDetailPatternSchema = z
  .string()
  .min(1, "Pattern cannot be empty")
  .max(200, "Pattern exceeds maximum length of 200 characters")
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
  );

export const PricingTierUsageConditionSchema = z.object({
  usageDetailPattern: UsageDetailPatternSchema,
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
  value: z.number().nonnegative(),
  caseSensitive: z.boolean().default(false),
});

export const PricingTierAttributeConditionSchema = z.object({
  source: z.enum(["model_parameters", "metadata"]),
  key: z.string().min(1, "Key cannot be empty").max(200),
  operator: z.literal("in"),
  values: z.array(z.string().min(1, "Value cannot be empty")).min(1),
});

/**
 * Pricing-specific condition union. Usage conditions preserve their established
 * persisted shape; observation attributes use an explicit exact-match shape.
 */
export const PricingTierConditionSchema = z.union([
  PricingTierUsageConditionSchema,
  PricingTierAttributeConditionSchema,
]);

export type PricingTierCondition = z.infer<typeof PricingTierConditionSchema>;

/**
 * Pricing tier input schema (for creation - no ID)
 * Used when creating new tiers via API or tRPC
 */
export const PricingTierInputSchema = z.object({
  // Trimmed before every later check, so a name differing only by whitespace
  // cannot pass uniqueness and then render as an identical label.
  name: z
    .string()
    .trim()
    .min(1, "Name cannot be empty")
    .max(100, "Name exceeds maximum length of 100 characters"),
  isDefault: z.boolean().default(false),
  priority: z
    .number()
    .int("Priority must be an integer")
    .min(0, "Priority must be non-negative")
    .max(999, "Priority cannot exceed 999"),
  conditions: z.array(PricingTierConditionSchema),
  prices: z.record(
    z.string(),
    z.number().nonnegative("Price must be non-negative"),
  ),
});

export type PricingTierInput = z.infer<typeof PricingTierInputSchema>;

/**
 * Indexes of entries whose name repeats an earlier one, with that name. The
 * first occurrence is not reported — it is the later one that is the duplicate.
 *
 * Shared with the model form so a duplicate means the same thing in the UI and
 * at the API boundary; the form needs the index to anchor a field error, the
 * API only needs to know that one exists.
 */
export function duplicateNameIndexes(
  entries: { name: string }[],
): [number, string][] {
  const seen = new Set<string>();
  const duplicates: [number, string][] = [];
  entries.forEach((entry, index) => {
    if (seen.has(entry.name)) duplicates.push([index, entry.name]);
    seen.add(entry.name);
  });
  return duplicates;
}

/** Indexes of non-default tiers with no condition, which can never match. */
export function tiersMissingConditions(
  tiers: { isDefault?: boolean; conditions: unknown[] }[],
): number[] {
  return tiers.flatMap((tier, index) =>
    !tier.isDefault && tier.conditions.length === 0 ? [index] : [],
  );
}

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
  const missingConditions = tiersMissingConditions(tiers);
  if (missingConditions.length > 0) {
    return {
      valid: false,
      error: `Non-default pricing tier "${tiers[missingConditions[0]].name}" must have at least one condition`,
    };
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
  if (duplicateNameIndexes(tiers).length > 0) {
    return { valid: false, error: "Pricing tier names must be unique" };
  }

  // Validate all usage-detail conditions have valid regex patterns
  for (const tier of tiers) {
    for (const condition of tier.conditions) {
      const pattern =
        "usageDetailPattern" in condition ? condition.usageDetailPattern : null;
      if (pattern === null) continue;

      try {
        validateRegexPattern(pattern);
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
