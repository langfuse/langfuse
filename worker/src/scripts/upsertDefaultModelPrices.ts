import { z } from "zod/v4";
import { prisma, PrismaClient } from "@langfuse/shared/src/db";
import defaultModelPrices from "../constants/default-model-prices.json";
import { clearFullModelCache, logger } from "@langfuse/shared/src/server";
import {
  PricingTierConditionSchema,
  validatePricingTiers,
} from "@langfuse/shared";

export const PricingTierSchema = z.object({
  id: z.string(),
  name: z.string(),
  isDefault: z.boolean(),
  priority: z.number().int(),
  conditions: z.array(PricingTierConditionSchema),
  prices: z.record(z.string(), z.number()),
});

export const DefaultModelPriceSchema = z
  .object({
    id: z.string(),
    modelName: z.string(),
    matchPattern: z.string(),
    createdAt: z.coerce.date(),
    updatedAt: z.coerce.date(),
    pricingTiers: z.array(PricingTierSchema),
    tokenizerConfig: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .nullish(),
    tokenizerId: z.string().nullish(),
  })
  .superRefine((data, ctx) => {
    const tierValidation = validatePricingTiers(data.pricingTiers);

    if (!tierValidation.valid) {
      ctx.addIssue({
        message: tierValidation.error,
      });
    }

    const defaultTiers = data.pricingTiers.filter((t) => t.isDefault);

    if (defaultTiers.length !== 1) {
      ctx.addIssue({
        message:
          "Each model must have exactly one default pricing tier (isDefault: true)",
      });
    }
  });

export type DefaultModelPrice = z.infer<typeof DefaultModelPriceSchema>;
export type PricingTier = z.infer<typeof PricingTierSchema>;

const ExistingModelTierSchema = z.object({
  modelId: z.string(),
  modelUpdatedAt: z.coerce.date(),
  tierId: z.string(),
  tierName: z.string(),
  tierPriority: z.number(),
  tierIsDefault: z.boolean(),
});

/**
 * Upserts default model prices into the database with pricing tiers.
 *
 * This function performs the following operations:
 * 1. Fetches existing default models and their tiers from the database.
 * 2. Parses and validates the default model prices from the JSON file.
 * 3. Processes the default model prices in batches.
 *
 * Transaction behavior:
 * - Each batch is processed in parallel
 * - Within a batch, each model upsert, tier upserts, and price upserts are in the same transaction
 *
 * Batching:
 * - Default model prices are processed in batches of 10 to optimize performance
 *
 * Server start-time overhead:
 * - If all models are up-to-date and 'force' is false, only the initial query will be executed.
 *
 * @param force - If true, updates all models regardless of their last update time.
 *                If false, only updates models that are outdated.
 */
export const upsertDefaultModelPrices = async (force = false) => {
  const startTime = Date.now();
  try {
    let hasUpdates = false;
    logger.debug(`Starting upsert of default model prices (force = ${force})`);

    const parsedDefaultModelPrices = z
      .array(DefaultModelPriceSchema)
      .parse(defaultModelPrices);

    // Fetch existing models with their tiers
    const existingModelsQuery = await prisma.$queryRaw`
      SELECT
        m.id AS "modelId",
        m.updated_at AS "modelUpdatedAt",
        t.id AS "tierId",
        t.name AS "tierName",
        t.priority AS "tierPriority",
        t.is_default AS "tierIsDefault"
      FROM
        models m
        INNER JOIN pricing_tiers t ON t.model_id = m.id
      WHERE
        m.project_id IS NULL
    `;

    const existingModels =
      ExistingModelTierSchema.array().parse(existingModelsQuery);

    // Build map of existing models with their tiers
    const existingModelsMap = new Map<
      string,
      {
        updatedAt: Date;
        tiers: Array<{
          id: string;
          name: string;
          priority: number;
          isDefault: boolean;
        }>;
      }
    >();

    for (const row of existingModels) {
      if (!existingModelsMap.has(row.modelId)) {
        existingModelsMap.set(row.modelId, {
          updatedAt: row.modelUpdatedAt,
          tiers: [],
        });
      }

      existingModelsMap.get(row.modelId)!.tiers.push({
        id: row.tierId,
        name: row.tierName,
        priority: row.tierPriority,
        isDefault: row.tierIsDefault,
      });
    }

    // Upsert in batches
    const batchSize = 10;
    const numBatches = Math.ceil(parsedDefaultModelPrices.length / batchSize);

    for (let i = 0; i < numBatches; i++) {
      logger.debug(`Processing batch ${i + 1} of ${numBatches}...`);

      const batch = parsedDefaultModelPrices.slice(
        i * batchSize,
        (i + 1) * batchSize,
      );

      const promises = [];

      for (const defaultModelPrice of batch) {
        const existingModel = existingModelsMap.get(defaultModelPrice.id);

        // Skip if up-to-date (unless force=true)
        if (
          !force &&
          existingModel &&
          isModelUpToDate(defaultModelPrice, existingModel)
        ) {
          logger.debug(
            `Default model ${defaultModelPrice.modelName} (${defaultModelPrice.id}) already up to date. Skipping.`,
          );
          continue;
        }

        // Skip if no tiers defined
        if (defaultModelPrice.pricingTiers.length === 0) {
          logger.debug(
            `No pricing tiers for ${defaultModelPrice.modelName} (${defaultModelPrice.id}). Skipping.`,
          );
          continue;
        }

        // Upsert model, tiers, and prices in a transaction
        promises.push(
          upsertModelWithTiers(defaultModelPrice, existingModel).catch(
            (error) => {
              logger.error(
                `Error upserting default model ${defaultModelPrice.modelName} (${defaultModelPrice.id}): ${error.message}`,
                { error },
              );
            },
          ),
        );
      }

      if (promises.length > 0) {
        hasUpdates = true;
      }

      await Promise.all(promises);

      logger.debug(`Completed batch ${i + 1} of ${numBatches}`);
    }

    if (hasUpdates) {
      await clearFullModelCache();
    }

    logger.info(
      `Finished upserting default model prices in ${Date.now() - startTime}ms`,
    );
  } catch (error) {
    logger.error(
      `Error upserting default model prices after ${Date.now() - startTime}ms: ${
        error instanceof Error ? error.message : ""
      }`,
      {
        error,
      },
    );
  }
};

/**
 * Upserts a model with its pricing tiers in a transaction
 */
async function upsertModelWithTiers(
  defaultModelPrice: DefaultModelPrice,
  existingModel:
    | {
        updatedAt: Date;
        tiers: Array<{
          id: string;
          name: string;
          priority: number;
          isDefault: boolean;
        }>;
      }
    | undefined,
) {
  await prisma.$transaction(async (tx) => {
    // 1. Upsert model
    await tx.model.upsert({
      where: {
        projectId: null,
        id: defaultModelPrice.id,
      },
      update: {
        modelName: defaultModelPrice.modelName,
        matchPattern: defaultModelPrice.matchPattern,
        updatedAt: defaultModelPrice.updatedAt,
        tokenizerConfig: defaultModelPrice.tokenizerConfig ?? undefined,
        tokenizerId: defaultModelPrice.tokenizerId,
      },
      create: {
        projectId: null,
        id: defaultModelPrice.id,
        modelName: defaultModelPrice.modelName,
        matchPattern: defaultModelPrice.matchPattern,
        tokenizerConfig: defaultModelPrice.tokenizerConfig ?? undefined,
        tokenizerId: defaultModelPrice.tokenizerId,
        createdAt: defaultModelPrice.createdAt,
        updatedAt: defaultModelPrice.updatedAt,
      },
    });

    // 2. Get tier IDs from JSON
    const jsonTierIds = new Set(
      defaultModelPrice.pricingTiers.map((t) => t.id),
    );

    // 3. Delete tiers that exist in DB but not in JSON (source of truth)
    if (existingModel) {
      const tiersToDelete = existingModel.tiers
        .filter((t) => !jsonTierIds.has(t.id))
        .map((t) => t.id);

      if (tiersToDelete.length > 0) {
        await tx.pricingTier.deleteMany({
          where: {
            id: { in: tiersToDelete },
            modelId: defaultModelPrice.id,
          },
        });
        logger.debug(
          `Deleted ${tiersToDelete.length} obsolete tiers for model ${defaultModelPrice.modelName}`,
        );
      }
    }

    // 4. Upsert each tier and its prices
    for (const tier of defaultModelPrice.pricingTiers) {
      await upsertTierWithPrices(
        tx,
        defaultModelPrice.id,
        defaultModelPrice.createdAt,
        defaultModelPrice.updatedAt,
        tier,
      );
    }

    logger.info(
      `Upserted default model ${defaultModelPrice.modelName} (${defaultModelPrice.id}) with ${defaultModelPrice.pricingTiers.length} tiers`,
    );
  });
}

/**
 * Upserts a single pricing tier with its prices
 */
async function upsertTierWithPrices(
  tx: Omit<
    PrismaClient,
    "$connect" | "$disconnect" | "$on" | "$transaction" | "$extends"
  >,
  modelId: string,
  createdAt: Date,
  updatedAt: Date,
  tier: PricingTier,
) {
  // Upsert tier
  await tx.pricingTier.upsert({
    where: { id: tier.id },
    update: {
      name: tier.name,
      isDefault: tier.isDefault,
      priority: tier.priority,
      conditions: tier.conditions,
      updatedAt,
    },
    create: {
      id: tier.id,
      modelId,
      name: tier.name,
      isDefault: tier.isDefault,
      priority: tier.priority,
      conditions: tier.conditions,
      createdAt,
      updatedAt,
    },
  });

  // Get existing prices for this tier
  const existingPrices = await tx.price.findMany({
    where: {
      modelId,
      pricingTierId: tier.id,
    },
    select: { usageType: true },
  });

  const existingUsageTypes = new Set(existingPrices.map((p) => p.usageType));
  const jsonUsageTypes = new Set(Object.keys(tier.prices));

  // Delete prices that exist in DB but not in JSON
  const usageTypesToDelete = Array.from(existingUsageTypes).filter(
    (ut) => !jsonUsageTypes.has(ut),
  );

  if (usageTypesToDelete.length > 0) {
    await tx.price.deleteMany({
      where: {
        modelId,
        pricingTierId: tier.id,
        usageType: { in: usageTypesToDelete },
      },
    });
  }

  // Upsert each price
  const priceUpserts = [];
  for (const [usageType, price] of Object.entries(tier.prices)) {
    priceUpserts.push(
      tx.price.upsert({
        where: {
          modelId_usageType_pricingTierId: {
            modelId,
            usageType,
            pricingTierId: tier.id,
          },
        },
        update: {
          price,
          updatedAt,
        },
        create: {
          modelId,
          projectId: null,
          pricingTierId: tier.id,
          usageType,
          price,
          createdAt,
          updatedAt,
        },
      }),
    );
  }

  await Promise.all(priceUpserts);
}

/**
 * Checks if a model is up-to-date by comparing updated_at and tiers
 */
function isModelUpToDate(
  defaultModelPrice: DefaultModelPrice,
  existingModel: {
    updatedAt: Date;
    tiers: Array<{
      id: string;
      name: string;
      priority: number;
      isDefault: boolean;
    }>;
  },
): boolean {
  // Check if updated_at matches
  const isUpdatedAtSame =
    existingModel.updatedAt.getTime() === defaultModelPrice.updatedAt.getTime();

  if (!isUpdatedAtSame) {
    return false;
  }

  // Check if tiers match (same count and same IDs)
  const jsonTierIds = new Set(defaultModelPrice.pricingTiers.map((t) => t.id));
  const dbTierIds = new Set(existingModel.tiers.map((t) => t.id));

  if (jsonTierIds.size !== dbTierIds.size) {
    return false;
  }

  for (const id of jsonTierIds) {
    if (!dbTierIds.has(id)) {
      return false;
    }
  }

  // Check if tier properties match
  for (const jsonTier of defaultModelPrice.pricingTiers) {
    const dbTier = existingModel.tiers.find((t) => t.id === jsonTier.id);
    if (!dbTier) {
      return false;
    }

    if (
      dbTier.name !== jsonTier.name ||
      dbTier.priority !== jsonTier.priority ||
      dbTier.isDefault !== jsonTier.isDefault
    ) {
      return false;
    }
  }

  return true;
}
