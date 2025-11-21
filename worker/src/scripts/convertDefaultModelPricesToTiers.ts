#!/usr/bin/env ts-node
/**
 * Utility script to convert old default-model-prices.json format to new tiered pricing format.
 *
 * OLD FORMAT:
 * {
 *   "id": "model_id",
 *   "model_name": "gpt-4o",
 *   "prices": { "input": 2.5e-6, "output": 10e-6 }
 * }
 *
 * NEW FORMAT:
 * {
 *   "id": "model_id",
 *   "model_name": "gpt-4o",
 *   "pricing_tiers": [
 *     {
 *       "id": "tier_uuid",
 *       "name": "Standard",
 *       "is_default": true,
 *       "priority": 0,
 *       "conditions": [],
 *       "prices": { "input": 2.5e-6, "output": 10e-6 }
 *     }
 *   ]
 * }
 *
 * USAGE:
 *   pnpm --filter=worker exec ts-node src/scripts/convertDefaultModelPricesToTiers.ts
 */

import * as fs from "fs";
import * as path from "path";
import { z } from "zod/v4";

// OLD SCHEMA
const OldDefaultModelPriceSchema = z.object({
  id: z.string(),
  model_name: z.string(),
  match_pattern: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  prices: z.record(z.string(), z.number()),
  tokenizer_config: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .nullish(),
  tokenizer_id: z.string().nullish(),
});

// NEW SCHEMA
const PricingTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  is_default: z.boolean(),
  priority: z.number().int(),
  conditions: z.array(
    z.object({
      usageDetailPattern: z.string(),
      operator: z.enum(["gt", "gte", "lt", "lte", "eq", "neq"]),
      value: z.number(),
      caseSensitive: z.boolean(),
    }),
  ),
  prices: z.record(z.string(), z.number()),
});

const NewDefaultModelPriceSchema = z.object({
  id: z.string(),
  model_name: z.string(),
  match_pattern: z.string(),
  created_at: z.string(), // ISO string in JSON
  updated_at: z.string(), // ISO string in JSON
  tokenizer_config: z
    .record(z.string(), z.union([z.string(), z.number()]))
    .nullish(),
  tokenizer_id: z.string().nullish(),
  pricing_tiers: z.array(PricingTierSchema),
});

type OldModelPrice = z.infer<typeof OldDefaultModelPriceSchema>;
type NewModelPrice = z.infer<typeof NewDefaultModelPriceSchema>;

/**
 * Convert old format to new format
 * Uses deterministic default tier IDs: {model_id}_tier_default
 */
function convertToTieredFormat(oldModel: OldModelPrice): NewModelPrice {
  // Create deterministic default tier ID - MATCHES MIGRATION LOGIC
  const defaultTierId = `${oldModel.id}_tier_default`;

  // Create a single default tier from the old prices
  const defaultTier = {
    id: defaultTierId, // Deterministic!
    name: "Standard",
    is_default: true,
    priority: 0,
    conditions: [],
    prices: oldModel.prices,
  };

  return {
    id: oldModel.id,
    model_name: oldModel.model_name,
    match_pattern: oldModel.match_pattern,
    created_at: oldModel.created_at.toISOString(),
    updated_at: oldModel.updated_at.toISOString(),
    tokenizer_config: oldModel.tokenizer_config ?? undefined,
    tokenizer_id: oldModel.tokenizer_id ?? undefined,
    pricing_tiers: [defaultTier],
  };
}

/**
 * Main conversion function
 */
async function convertFile() {
  const inputPath = path.join(
    __dirname,
    "../constants/default-model-prices.json",
  );
  const outputPath = path.join(
    __dirname,
    "../constants/default-model-prices-new.json",
  );
  const backupPath = path.join(
    __dirname,
    "../constants/default-model-prices.backup.json",
  );

  console.log("Reading old format from:", inputPath);

  // Read and parse old format
  const oldData = JSON.parse(fs.readFileSync(inputPath, "utf-8"));
  const oldModels = z.array(OldDefaultModelPriceSchema).parse(oldData);

  console.log(`Found ${oldModels.length} models to convert`);

  // Convert to new format
  const newModels: NewModelPrice[] = oldModels.map(convertToTieredFormat);

  // Validate new format
  z.array(NewDefaultModelPriceSchema).parse(newModels);

  // Create backup of old file
  fs.copyFileSync(inputPath, backupPath);
  console.log("Backup created at:", backupPath);

  // Write new format
  fs.writeFileSync(outputPath, JSON.stringify(newModels, null, 2));
  console.log("New format written to:", outputPath);

  // Show sample conversion
  console.log("\n=== SAMPLE CONVERSION ===");
  console.log("OLD:", JSON.stringify(oldModels[0], null, 2));
  console.log("\nNEW:", JSON.stringify(newModels[0], null, 2));

  console.log("\n✅ Conversion complete!");
  console.log(
    `\nTo replace the original file, run:\n  mv ${outputPath} ${inputPath}`,
  );
}

// Run conversion
convertFile().catch((error) => {
  console.error("❌ Conversion failed:", error);
  process.exit(1);
});
