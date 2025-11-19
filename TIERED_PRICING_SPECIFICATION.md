# Tiered Pricing for LLM Models - Core Architecture Specification

## 1. Executive Summary

This specification defines the architecture for supporting tiered pricing in Langfuse, enabling accurate cost tracking for LLM providers (Anthropic, Google Gemini) that implement usage-based pricing tiers.

### Problem Statement

Major LLM providers now implement tiered pricing where costs vary based on usage thresholds:

- **Anthropic Claude**: $3/M tokens (0-200K prompt tokens) → $6/M tokens (>200K prompt tokens)
- **Google Gemini 2.5 Pro**: Tiered pricing at 200K token threshold

Langfuse's current flat-rate pricing system cannot accurately track costs for these models, undermining our value proposition for cost observability.

### Competitive Advantage

**Langsmith does not currently support tiered pricing tracking.**

### Key Design Decisions

- ✅ **Regex pattern matching** with summing of matching `usage_details` keys
- ✅ **Explicit default tiers** (no NULL-based implicit defaults)
- ✅ **Case-insensitive regex** matching by default
- ✅ **Tier name + ID stored** in ClickHouse observations (snapshot, no JOIN)
- ✅ **Integration in IngestionService** via new `matchPricingTier` function
- ✅ **safe-regex2 validation** to prevent catastrophic backtracking

---

## 2. Database Schema

### 2.1 PostgreSQL Schema (Prisma)

#### New Table: `model_pricing_tiers`

```prisma
model ModelPricingTier {
  id          String   @id @default(cuid())
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @default(now()) @updatedAt @map("updated_at")

  // Relationships
  modelId     String   @map("model_id")
  model       Model    @relation(fields: [modelId], references: [id], onDelete: Cascade)

  // Tier properties
  name        String   @map("name")              // Required: "Standard Pricing", "Large Context Tier"
  isDefault   Boolean  @default(false) @map("is_default")
  priority    Int      @map("priority")          // Lower = evaluated first (default = 0)

  // Matching logic (JSON array of conditions)
  conditions  Json     @map("conditions")        // PricingTierCondition[]

  // Related prices
  prices      Price[]

  // Constraints
  @@unique([modelId, priority])
  @@unique([modelId, name])                      // Tier names must be unique per model
  @@index([modelId, isDefault])
  @@map("model_pricing_tiers")
}
```

**Design Rationale**:

- `name` is required for UI display and historical tracking
- `isDefault` flag ensures exactly one default per model
- `priority` determines evaluation order (lower = higher priority)
- `conditions` stores JSON array for flexible matching logic
- Unique constraints prevent duplicate priorities/names per model

#### Modified Table: `prices`

```prisma
model Price {
  id        String   @id @default(cuid())
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @default(now()) @updatedAt @map("updated_at")

  modelId   String   @map("model_id")
  Model     Model    @relation(fields: [modelId], references: [id], onDelete: Cascade)

  // NEW: Link to pricing tier (always non-NULL after migration)
  pricingTierId String            @map("pricing_tier_id")
  pricingTier   ModelPricingTier  @relation(fields: [pricingTierId], references: [id], onDelete: Cascade)

  projectId String?  @map("project_id")
  project   Project? @relation(fields: [projectId], references: [id], onDelete: Cascade)

  usageType String   @map("usage_type")  // "input", "output", "total", etc.
  price     Decimal

  // Modified unique constraint
  @@unique([modelId, usageType, pricingTierId])
  @@map("prices")
}
```

**Migration Impact**:

- All existing prices will be linked to auto-created default tiers
- Backward compatible: legacy prices become "Standard Pricing" default tier

#### Updated Table: `models`

```prisma
model Model {
  // ... existing fields ...

  Price         Price[]
  pricingTiers  ModelPricingTier[]  // NEW relationship

  // ... rest unchanged ...
}
```

### 2.2 ClickHouse Schema

#### Modify `observations` Table

```sql
-- Add columns to observations table
ALTER TABLE observations
ADD COLUMN IF NOT EXISTS usage_pricing_tier_id Nullable(String)
COMMENT 'ID of the pricing tier used for cost calculation';

ALTER TABLE observations
ADD COLUMN IF NOT EXISTS usage_pricing_tier_name Nullable(String)
COMMENT 'Name of the pricing tier (snapshot at ingestion time)';
```

**Design Rationale**:

- Storing both ID and name avoids JOINs for cost breakdowns
- Name is a snapshot: preserves historical tier names even if renamed later
- Nullable columns: non-breaking change, NULL acceptable for historical data

---

## 3. TypeScript Types & Zod Schemas

### 3.1 Condition Types

```typescript
// packages/shared/src/server/pricing-tiers/types.ts
import { z } from "zod/v4";

/**
 * Single condition for pricing tier matching
 */
export const PricingTierConditionSchema = z.object({
  usageDetailPattern: z.string().min(1).max(200), // Regex pattern
  operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
  value: z.number(),
  caseSensitive: z.boolean().default(false), // Case-insensitive by default
});

export type PricingTierCondition = z.infer<typeof PricingTierConditionSchema>;

/**
 * Array of conditions (AND logic)
 */
export const PricingTierConditionsSchema = z.array(PricingTierConditionSchema);

export type PricingTierConditions = z.infer<typeof PricingTierConditionsSchema>;
```

**Pattern Matching Examples**:

- `^input` matches: `input`, `input_tokens`, `input_cached`, `input_regular`
- `^(input|prompt)` matches: `input_tokens`, `prompt_tokens`
- `_cache$` matches: `input_cache`, `output_cache`

### 3.2 Pricing Tier Types

```typescript
// packages/shared/src/server/pricing-tiers/types.ts

/**
 * Result of tier matching
 */
export type PricingTierMatchResult = {
  pricingTierId: string;
  pricingTierName: string;
  prices: Record<string, Decimal>; // usageType -> price
};

/**
 * Pricing tier with prices included
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
```

### 3.3 Zod Validation Schemas

```typescript
// For tRPC/API input validation
export const CreatePricingTierSchema = z.object({
  modelId: z.string(),
  name: z.string().min(1).max(100),
  isDefault: z.boolean().default(false),
  priority: z.number().int().min(0).max(999),
  conditions: PricingTierConditionsSchema,
  prices: z.record(
    z.string(), // usageType
    z.number().nonnegative(), // price
  ),
});

export const UpdatePricingTierSchema = z.object({
  pricingTierId: z.string(),
  name: z.string().min(1).max(100).optional(),
  conditions: PricingTierConditionsSchema.optional(),
  prices: z.record(z.string(), z.number().nonnegative()).optional(),
});
```

---

## 4. Matching Algorithm

### 4.1 Core Implementation

```typescript
// packages/shared/src/server/pricing-tiers/matcher.ts
import safeRegex from "safe-regex2";
import { logger, traceException } from "@langfuse/shared/src/server";
import type { PricingTierCondition, PricingTierWithPrices } from "./types";

/**
 * Validates regex pattern for safety
 * @throws Error if pattern is invalid or unsafe
 */
export function validateRegexPattern(pattern: string): void {
  // Length check
  if (pattern.length > 200) {
    throw new Error("Pattern exceeds maximum length of 200 characters");
  }

  // Syntax check
  try {
    new RegExp(pattern, "i");
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
 * Evaluates a single condition against usage details
 */
function evaluateCondition(
  condition: PricingTierCondition,
  usageDetails: Record<string, number>,
): boolean {
  try {
    // Build regex with case sensitivity flag
    const flags = condition.caseSensitive ? "" : "i";
    const regex = new RegExp(condition.usageDetailPattern, flags);

    // Find all keys matching the pattern
    const matchingKeys = Object.keys(usageDetails).filter((key) =>
      regex.test(key),
    );

    // Sum values of matching keys
    const sum = matchingKeys.reduce(
      (acc, key) => acc + (usageDetails[key] || 0),
      0,
    );

    // Compare sum to threshold
    switch (condition.operator) {
      case "gt":
        return sum > condition.value;
      case "gte":
        return sum >= condition.value;
      case "lt":
        return sum < condition.value;
      case "lte":
        return sum <= condition.value;
      case "eq":
        return sum === condition.value;
      case "neq":
        return sum !== condition.value;
      default:
        logger.warn(`Unknown operator: ${condition.operator}`);
        return false;
    }
  } catch (error) {
    traceException(error);
    logger.error("Error evaluating condition", {
      condition,
      error: error instanceof Error ? error.message : String(error),
    });
    return false; // Fail-safe: condition fails on error
  }
}

/**
 * Evaluates all conditions for a tier (AND logic)
 */
function evaluateConditions(
  conditions: PricingTierCondition[],
  usageDetails: Record<string, number>,
): boolean {
  // Empty conditions should never match (except for default tiers)
  if (conditions.length === 0) {
    return false;
  }

  // All conditions must pass (AND logic)
  return conditions.every((condition) =>
    evaluateCondition(condition, usageDetails),
  );
}

/**
 * Matches usage details against pricing tiers and returns applicable prices
 */
export function matchPricingTier(
  tiers: PricingTierWithPrices[],
  usageDetails: Record<string, number>,
): PricingTierMatchResult | null {
  // 1. Filter and sort non-default tiers by priority (ascending)
  const sortedTiers = tiers
    .filter((tier) => !tier.isDefault)
    .sort((a, b) => a.priority - b.priority);

  // 2. Try to match each tier in priority order
  for (const tier of sortedTiers) {
    if (evaluateConditions(tier.conditions, usageDetails)) {
      logger.debug("Matched pricing tier", {
        tierId: tier.id,
        tierName: tier.name,
        priority: tier.priority,
      });

      return {
        pricingTierId: tier.id,
        pricingTierName: tier.name,
        prices: Object.fromEntries(
          tier.prices.map((p) => [p.usageType, p.price]),
        ),
      };
    }
  }

  // 3. Fall back to default tier
  const defaultTier = tiers.find((tier) => tier.isDefault);

  if (defaultTier) {
    logger.debug("Using default pricing tier", {
      tierId: defaultTier.id,
      tierName: defaultTier.name,
    });

    return {
      pricingTierId: defaultTier.id,
      pricingTierName: defaultTier.name,
      prices: Object.fromEntries(
        defaultTier.prices.map((p) => [p.usageType, p.price]),
      ),
    };
  }

  // 4. No match and no default (should not happen after migration)
  logger.warn("No pricing tier matched and no default found", {
    usageDetails,
    availableTiers: tiers.map((t) => ({ id: t.id, name: t.name })),
  });

  return null;
}
```

### 4.2 Algorithm Complexity

**Time Complexity**: O(t × c × k)

- t = number of tiers
- c = conditions per tier
- k = keys in usage_details

**Typical Case**: 3 tiers × 2 conditions × 10 keys = 60 evaluations @ ~0.01ms = **0.6ms**

**Worst Case**: 10 tiers × 5 conditions × 20 keys = 1000 evaluations @ ~0.01ms = **10ms**

### 4.3 Example Usage

```typescript
// Example: Anthropic Claude with tiered pricing
const tiers: PricingTierWithPrices[] = [
  {
    id: "tier_large_context",
    name: "Large Context (>200K tokens)",
    isDefault: false,
    priority: 1,
    conditions: [
      {
        usageDetailPattern: "^input", // Matches: input, input_tokens, input_cached
        operator: "gt",
        value: 200000,
        caseSensitive: false,
      },
    ],
    prices: [
      { usageType: "input", price: new Decimal("0.000006") }, // $6/M
      { usageType: "output", price: new Decimal("0.000015") }, // $15/M
    ],
  },
  {
    id: "tier_standard",
    name: "Standard Pricing",
    isDefault: true,
    priority: 0,
    conditions: [],
    prices: [
      { usageType: "input", price: new Decimal("0.000003") }, // $3/M
      { usageType: "output", price: new Decimal("0.000015") }, // $15/M
    ],
  },
];

// Usage details from observation
const usageDetails = {
  input_tokens: 250000,
  output_tokens: 2000,
};

const result = matchPricingTier(tiers, usageDetails);
// Result: tier_large_context (250K > 200K threshold)
```

---

## 5. Integration Architecture

### 5.1 Integration Point: IngestionService

```typescript
// worker/src/services/IngestionService/index.ts

import { matchPricingTier } from "@langfuse/shared/src/server/pricing-tiers/matcher";
import { getPricingTiersForModel } from "@langfuse/shared/src/server/pricing-tiers/data-access";

// Modify processObservationEventList method
private async processObservationEventList(params: {
  projectId: string;
  entityId: string;
  createdAtTimestamp: Date;
  observationEventList: ObservationEvent[];
}): Promise<void> {
  // ... existing code to resolve model ...

  const { model, prices: defaultPrices } = await findModel({
    projectId,
    model: observationRecord.provided_model_name,
  });

  // NEW: Match pricing tier based on usage_details
  let pricingTierResult: PricingTierMatchResult | null = null;
  let tierPrices = defaultPrices;

  if (model && observationRecord.usage_details) {
    const tiers = await getPricingTiersForModel(model.id);

    if (tiers.length > 0) {
      pricingTierResult = matchPricingTier(tiers, observationRecord.usage_details);

      if (pricingTierResult) {
        // Use tier-specific prices instead of default
        tierPrices = Object.entries(pricingTierResult.prices).map(
          ([usageType, price]) => ({ usageType, price })
        );
      }
    }
  }

  // Calculate costs using tier-specific prices
  const costs = IngestionService.calculateUsageCosts(
    tierPrices,
    observationRecord.provided_cost_details,
    observationRecord.usage_details
  );

  // NEW: Add pricing tier info to observation record
  const observationWithTier = {
    ...observationRecord,
    ...costs,
    usage_pricing_tier_id: pricingTierResult?.pricingTierId ?? null,
    usage_pricing_tier_name: pricingTierResult?.pricingTierName ?? null,
  };

  // Continue with existing insertion logic...
}
```

### 5.2 Data Access Layer

```typescript
// packages/shared/src/server/pricing-tiers/data-access.ts
import { prisma } from "@langfuse/shared/src/db";
import { redis } from "@langfuse/shared/src/server";
import type { PricingTierWithPrices } from "./types";
import { Decimal } from "decimal.js";

const TIER_CACHE_TTL = 3600; // 1 hour
const TIER_CACHE_PREFIX = "pricing_tiers:";

/**
 * Fetches pricing tiers for a model with Redis caching
 */
export async function getPricingTiersForModel(
  modelId: string,
): Promise<PricingTierWithPrices[]> {
  const cacheKey = `${TIER_CACHE_PREFIX}${modelId}`;

  // Try cache first
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached, (key, value) => {
          // Revive Decimal objects
          if (
            value &&
            typeof value === "object" &&
            value.__type === "Decimal"
          ) {
            return new Decimal(value.value);
          }
          return value;
        });
      }
    } catch (error) {
      logger.warn("Failed to read pricing tiers from cache", {
        error,
        modelId,
      });
    }
  }

  // Fetch from database
  const tiers = await prisma.modelPricingTier.findMany({
    where: { modelId },
    include: {
      prices: {
        select: {
          usageType: true,
          price: true,
        },
      },
    },
    orderBy: { priority: "asc" },
  });

  const result: PricingTierWithPrices[] = tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    isDefault: tier.isDefault,
    priority: tier.priority,
    conditions: tier.conditions as PricingTierCondition[],
    prices: tier.prices,
  }));

  // Cache result
  if (redis) {
    try {
      await redis.setex(
        cacheKey,
        TIER_CACHE_TTL,
        JSON.stringify(result, (key, value) => {
          // Serialize Decimal objects
          if (value instanceof Decimal) {
            return { __type: "Decimal", value: value.toString() };
          }
          return value;
        }),
      );
    } catch (error) {
      logger.warn("Failed to cache pricing tiers", { error, modelId });
    }
  }

  return result;
}

/**
 * Invalidates pricing tier cache for a model
 */
export async function clearPricingTierCache(modelId: string): Promise<void> {
  if (redis) {
    const cacheKey = `${TIER_CACHE_PREFIX}${modelId}`;
    try {
      await redis.del(cacheKey);
      logger.debug("Cleared pricing tier cache", { modelId });
    } catch (error) {
      logger.warn("Failed to clear pricing tier cache", { error, modelId });
    }
  }
}
```

**Caching Strategy**:

- Redis cache with 1-hour TTL
- Cache key: `pricing_tiers:{modelId}`
- Invalidate on tier CRUD operations
- Follows existing `findModel` caching pattern

---

## 6. Migration Strategy

### 6.1 PostgreSQL Migration

```sql
-- packages/shared/prisma/migrations/YYYYMMDD_add_pricing_tiers/migration.sql

-- Step 1: Create model_pricing_tiers table
CREATE TABLE model_pricing_tiers (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  priority INTEGER NOT NULL,
  conditions JSONB NOT NULL,
  CONSTRAINT unique_model_priority UNIQUE(model_id, priority),
  CONSTRAINT unique_model_name UNIQUE(model_id, name)
);

-- Step 2: Create indexes
CREATE INDEX idx_model_pricing_tiers_model_default
ON model_pricing_tiers(model_id, is_default);

-- Step 3: Add pricing_tier_id to prices table
ALTER TABLE prices
ADD COLUMN pricing_tier_id TEXT;

-- Step 4: Create default pricing tiers for all models with prices
INSERT INTO model_pricing_tiers (id, model_id, name, is_default, priority, conditions)
SELECT
  gen_random_uuid()::text,
  model_id,
  'Standard Pricing',
  TRUE,
  0,
  '[]'::jsonb
FROM (
  SELECT DISTINCT model_id FROM prices WHERE pricing_tier_id IS NULL
) AS distinct_models;

-- Step 5: Link existing prices to default tiers
UPDATE prices p
SET pricing_tier_id = pt.id
FROM model_pricing_tiers pt
WHERE p.model_id = pt.model_id
  AND pt.is_default = TRUE
  AND p.pricing_tier_id IS NULL;

-- Step 6: Make pricing_tier_id NOT NULL and add FK constraint
ALTER TABLE prices
ALTER COLUMN pricing_tier_id SET NOT NULL;

ALTER TABLE prices
ADD CONSTRAINT fk_prices_pricing_tier
FOREIGN KEY (pricing_tier_id) REFERENCES model_pricing_tiers(id) ON DELETE CASCADE;

-- Step 7: Drop old unique constraint and create new one
ALTER TABLE prices DROP CONSTRAINT IF EXISTS prices_modelId_usageType_key;

CREATE UNIQUE INDEX unique_prices_model_usage_tier
ON prices(model_id, usage_type, pricing_tier_id);
```

**Migration Safety**:

- Steps 1-3: Non-breaking (additive)
- Step 4-5: Backfills data for existing models
- Step 6-7: Breaking changes (requires coordination)

### 6.2 ClickHouse Migration

```sql
-- packages/shared/clickhouse/migrations/YYYYMMDD_add_pricing_tier_columns.sql

-- Add columns to observations table
ALTER TABLE observations
ADD COLUMN IF NOT EXISTS usage_pricing_tier_id Nullable(String)
COMMENT 'ID of the pricing tier used for cost calculation';

ALTER TABLE observations
ADD COLUMN IF NOT EXISTS usage_pricing_tier_name Nullable(String)
COMMENT 'Name of the pricing tier (snapshot at ingestion time)';

-- No backfill needed - NULL is acceptable for historical data
```

**Migration Impact**:

- Non-breaking: columns are nullable
- No downtime required
- Historical observations remain valid with NULL tier info

---

## 7. Key Design Decisions

| Decision                            | Rationale                                                                                                                                    |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Regex patterns with sum**         | Handles granular usage breakdowns (input_cached + input_regular) correctly. Providers may send multiple keys that contribute to a threshold. |
| **Explicit default tiers**          | Consistent data model, no NULL special cases, manageable via UI. Every model has exactly one default tier.                                   |
| **Case-insensitive by default**     | User-friendly: providers may vary capitalization (`input_tokens` vs `INPUT_TOKENS`).                                                         |
| **Store tier name snapshot**        | Avoids JOINs in cost breakdown queries. Preserves historical context even if tier is renamed.                                                |
| **safe-regex2 validation**          | Prevents catastrophic backtracking DoS attacks from malicious regex patterns.                                                                |
| **Priority 0 for defaults**         | Intuitive UX: default appears first in tier lists.                                                                                           |
| **Integration in IngestionService** | Centralized cost calculation logic, follows existing patterns.                                                                               |
| **Redis caching**                   | Reduces DB load during high ingestion volume. Follows existing `findModel` caching pattern.                                                  |
| **No short-circuit eval**           | Simplicity over micro-optimization (negligible perf impact for typical conditions).                                                          |
| **Conditions use AND logic**        | Simpler initial implementation. OR logic can be added later if needed.                                                                       |
| **Allow tier deletion**             | Historical observations retain tier name snapshot, so deletion is safe.                                                                      |

---

## 9. Example Tier Configurations

### 9.1 Anthropic Claude Sonnet 4.5

```json
[
  {
    "name": "Large Context (>200K)",
    "isDefault": false,
    "priority": 1,
    "conditions": [
      {
        "usageDetailPattern": "^input",
        "operator": "gt",
        "value": 200000,
        "caseSensitive": false
      }
    ],
    "prices": {
      "input": 6.0,
      "output": 15.0
    }
  },
  {
    "name": "Standard Pricing",
    "isDefault": true,
    "priority": 0,
    "conditions": [],
    "prices": {
      "input": 3.0,
      "output": 15.0
    }
  }
]
```

### 9.2 Google Gemini 2.5 Pro

```json
[
  {
    "name": "High Volume (>200K)",
    "isDefault": false,
    "priority": 1,
    "conditions": [
      {
        "usageDetailPattern": "^(input|prompt)",
        "operator": "gt",
        "value": 200000,
        "caseSensitive": false
      }
    ],
    "prices": {
      "input": 2.5,
      "output": 10.0
    }
  },
  {
    "name": "Standard Pricing",
    "isDefault": true,
    "priority": 0,
    "conditions": [],
    "prices": {
      "input": 1.25,
      "output": 5.0
    }
  }
]
```

### 9.3 Complex Example: Multiple Conditions

```json
{
  "name": "Enterprise Tier",
  "isDefault": false,
  "priority": 2,
  "conditions": [
    {
      "usageDetailPattern": "^input",
      "operator": "gt",
      "value": 500000,
      "caseSensitive": false
    },
    {
      "usageDetailPattern": "^output",
      "operator": "lt",
      "value": 10000,
      "caseSensitive": false
    }
  ],
  "prices": {
    "input": 10.0,
    "output": 20.0
  }
}
```

**Evaluation**: Both conditions must pass (AND logic) for tier to match.

---
