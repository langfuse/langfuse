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

export const upsertDefaultModelPrices = async (force = false) => {
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
    const batches = Math.ceil(parsedDefaultModelPrices.length / batchSize);

    for (let i = 0; i < batches; i++) {
      logger.debug(`Processing batch ${i + 1} of ${batches}...`);

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
          existingModelUpdateDate > defaultModelPrice.updated_at
        ) {
          logger.error(
            `Model drift detected for default model ${defaultModelPrice.model_name} (${defaultModelPrice.id}). updatedAt ${existingModelUpdateDate} after ${defaultModelPrice.updated_at}.`
          );
          continue;
        }

        if (
          !force &&
          existingModelUpdateDate &&
          existingModelUpdateDate.getTime() ==
            defaultModelPrice.updated_at.getTime()
        ) {
          logger.debug(
            `Default model ${defaultModelPrice.model_name} (${defaultModelPrice.id}) already up to date. Skipping.`
          );
          continue;
        }

        // Upsert model and prices in a transaction
        promises.push(
          await prisma
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

              for (const [itemName, price] of Object.entries(
                defaultModelPrice.prices
              )) {
                await tx.price.upsert({
                  where: {
                    modelId_itemName: {
                      modelId: defaultModelPrice.id,
                      itemName,
                    },
                  },
                  update: {
                    price,
                    updatedAt: defaultModelPrice.updated_at,
                  },
                  create: {
                    modelId: defaultModelPrice.id,
                    itemName,
                    price,
                    createdAt: defaultModelPrice.created_at,
                    updatedAt: defaultModelPrice.updated_at,
                  },
                });
              }

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
      logger.debug(`Completed batch ${i + 1} of ${batches}.`);
    }

    logger.debug("Finished upserting default model prices.");
  } catch (error) {
    logger.error(
      `Error upserting default model prices: ${error instanceof Error ? error.message : ""}`,
      {
        error,
      }
    );
  }
};
