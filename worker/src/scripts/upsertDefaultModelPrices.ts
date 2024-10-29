import { z } from "zod";
import { prisma } from "@langfuse/shared/src/db";
import defaultModelPrices from "../constants/default-model-prices.json";
import { logger } from "@langfuse/shared/src/server";

const DefaultModelPriceSchema = z.object({
  id: z.string(),
  model_name: z.string(),
  match_pattern: z.string(),
  created_at: z.coerce.date(),
  updated_at: z.coerce.date(),
  prices: z.record(z.number()),
  tokenizer_config: z.record(z.union([z.string(), z.number()])).nullish(),
  tokenizer_id: z.string().nullish(),
});

/**
 * Upserts default model prices into the database into models and prices tables.
 *
 * This function performs the following operations:
 * 1. Fetches existing default models from the database (single query, not in transaction).
 * 2. Parses and validates the default model prices from the JSON file in the constants folder.
 * 3. Processes the default model prices in batches.
 *
 * Transaction behavior:
 * - Each batch is processed in parallel
 * - Within a batch, each model upsert and corresponding price upsert are in the same transaction
 *
 * Batching:
 * - Default model prices are processed in batches of 10 to optimize performance / not overwhelm the database
 *
 * Server start-time overhead:
 * - If all models are up-to-date and 'force' is false, only the initial query to fetch
 *   existing model update dates will be executed.
 *
 * @param force - If true, updates all models regardless of their last update time.
 *                If false, only updates models that are outdated.
 */

export const upsertDefaultModelPrices = async (force = false) => {
  const startTime = Date.now();
  try {
    logger.debug(`Starting upsert of default model prices (force = ${force})`);

    const parsedDefaultModelPrices = z
      .array(DefaultModelPriceSchema)
      .parse(defaultModelPrices);

    // Fetch existing default models. Store in a map for O(1) lookup.
    const existingModelUpdateDates = new Map(
      (
        await prisma.model.findMany({
          where: {
            projectId: null,
          },
          select: {
            id: true,
            updatedAt: true,
          },
        })
      ).map((model) => [model.id, model.updatedAt])
    );

    // Upsert in batches
    const batchSize = 10;
    const numBatches = Math.ceil(parsedDefaultModelPrices.length / batchSize);

    for (let i = 0; i < numBatches; i++) {
      logger.debug(`Processing batch ${i + 1} of ${numBatches}...`);

      const batch = parsedDefaultModelPrices.slice(
        i * batchSize,
        (i + 1) * batchSize
      );

      const promises = [];

      for (const defaultModelPrice of batch) {
        const existingModelUpdateDate = existingModelUpdateDates.get(
          defaultModelPrice.id
        );

        if (
          !force &&
          existingModelUpdateDate &&
          existingModelUpdateDate.getTime() ===
            defaultModelPrice.updated_at.getTime()
        ) {
          logger.debug(
            `Default model ${defaultModelPrice.model_name} (${defaultModelPrice.id}) already up to date. Skipping.`
          );
          continue;
        }

        if (
          !force &&
          existingModelUpdateDate &&
          existingModelUpdateDate.getTime() >
            defaultModelPrice.updated_at.getTime()
        ) {
          logger.error(
            `Model drift detected for default model ${defaultModelPrice.model_name} (${defaultModelPrice.id}). updatedAt ${existingModelUpdateDate.toISOString()} after ${defaultModelPrice.updated_at.toISOString()}. Upserting model and prices.`
          );
        }

        // Upsert model and prices in a transaction
        promises.push(
          prisma
            .$transaction(async (tx) => {
              await tx.model.upsert({
                where: {
                  projectId: null,
                  id: defaultModelPrice.id,
                },
                update: {
                  modelName: defaultModelPrice.model_name,
                  matchPattern: defaultModelPrice.match_pattern,
                  updatedAt: defaultModelPrice.updated_at,
                  tokenizerConfig:
                    defaultModelPrice.tokenizer_config ?? undefined,
                  tokenizerId: defaultModelPrice.tokenizer_id,
                },
                create: {
                  projectId: null,
                  id: defaultModelPrice.id,
                  modelName: defaultModelPrice.model_name,
                  matchPattern: defaultModelPrice.match_pattern,
                  tokenizerConfig:
                    defaultModelPrice.tokenizer_config ?? undefined,
                  tokenizerId: defaultModelPrice.tokenizer_id,
                  createdAt: defaultModelPrice.created_at,
                  updatedAt: defaultModelPrice.updated_at,
                },
              });

              const pricesToUpsert = [];

              for (const [usageType, price] of Object.entries(
                defaultModelPrice.prices
              )) {
                pricesToUpsert.push(
                  tx.price.upsert({
                    where: {
                      modelId_usageType: {
                        modelId: defaultModelPrice.id,
                        usageType,
                      },
                    },
                    update: {
                      price,
                      updatedAt: defaultModelPrice.updated_at,
                    },
                    create: {
                      modelId: defaultModelPrice.id,
                      usageType,
                      price,
                      createdAt: defaultModelPrice.created_at,
                      updatedAt: defaultModelPrice.updated_at,
                    },
                  })
                );
              }

              await Promise.all(pricesToUpsert);

              logger.info(
                `Upserted default model ${defaultModelPrice.model_name} (${defaultModelPrice.id})`
              );
            })
            .catch((error) => {
              logger.error(
                `Error upserting default model ${defaultModelPrice.model_name} (${defaultModelPrice.id}): ${error.message}`,
                {
                  error,
                }
              );
            })
        );
      }

      await Promise.all(promises);
      logger.debug(`Completed batch ${i + 1} of ${numBatches}`);
    }

    logger.info(
      `Finished upserting default model prices in ${Date.now() - startTime}ms`
    );
  } catch (error) {
    logger.error(
      `Error upserting default model prices after ${Date.now() - startTime}ms: ${
        error instanceof Error ? error.message : ""
      }`,
      {
        error,
      }
    );
  }
};
