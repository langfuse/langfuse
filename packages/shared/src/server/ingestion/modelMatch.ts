import { Model, Prisma } from "../../";
import {
  instrumentAsync,
  instrumentSync,
  logger,
  recordIncrement,
  redis,
  safeMultiDel,
  scanKeys,
} from "../";
import { env } from "../../env";
import { Decimal } from "decimal.js";
import { prisma } from "../../db";
import type { PricingTierWithPrices } from "../pricing-tiers";

export type ModelMatchProps = {
  projectId: string;
  model: string;
};

export type ModelWithPrices = {
  model: Model | null;
  pricingTiers: PricingTierWithPrices[];
};

const MODEL_MATCH_CACHE_LOCKED_KEY = "LOCK:model-match-clear";

export async function findModel(p: ModelMatchProps): Promise<ModelWithPrices> {
  return instrumentAsync(
    {
      name: "model-match",
      traceScope: "model-match",
    },
    async (span) => {
      if (logger.isLevelEnabled("debug")) {
        logger.debug(`Finding model for ${JSON.stringify(p)}`);
      }
      const cachedResult = await getModelWithPricesFromRedis(p);
      if (cachedResult) {
        span.setAttribute("model_match_source", "redis");

        if (cachedResult.model === null) {
          return { model: null, pricingTiers: [] };
        } else {
          logger.debug(
            `Found model name ${cachedResult.model?.modelName} (id: ${cachedResult.model?.id}) for project ${p.projectId} and model ${p.model}`,
          );
          span.setAttribute("matched_model_id", cachedResult.model.id);
        }

        return cachedResult;
      }

      // try to find model in Postgres
      const postgresModel = await findModelInPostgres(p);

      if (postgresModel && env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
        const pricingTiers = await findPricingTiersForModel(postgresModel.id);
        await addModelWithPricingTiersToRedis(p, postgresModel, pricingTiers);

        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "true");

        logger.debug(
          `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
        );
        return { model: postgresModel, pricingTiers };
      } else if (postgresModel) {
        const pricingTiers = await findPricingTiersForModel(postgresModel.id);
        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "false");

        logger.debug(
          `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
        );
        return { model: postgresModel, pricingTiers };
      } else {
        span.setAttribute("model_match_source", "none");

        if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
          await addModelNotFoundTokenToRedis(p);
          span.setAttribute("model_cache_set", "true");
        }

        logger.debug(
          `Model not found for project ${p.projectId} and model ${p.model}`,
        );
        return { model: null, pricingTiers: [] };
      }
    },
  );
}

const getModelWithPricesFromRedis = async (
  p: ModelMatchProps,
): Promise<ModelWithPrices | null> => {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false") {
    return null;
  }

  try {
    if (await isModelMatchCacheLocked()) {
      logger.info(
        "Model match cache is locked. Skipping model lookup from Redis.",
      );

      return null;
    }

    const key = getRedisModelKey(p);
    const redisValue = await redis?.get(key);
    if (!redisValue) {
      recordIncrement("langfuse.model_match.cache_miss", 1);
      return null;
    }

    recordIncrement("langfuse.model_match.cache_hit", 1);

    if (redisValue === NOT_FOUND_TOKEN) {
      return { model: null, pricingTiers: [] };
    }

    const parsed = instrumentSync(
      {
        name: "parse-redis-model",
        traceScope: "model-match",
      },
      (span) => {
        span.setAttribute("model-cache-value-length", redisValue.length);

        return JSON.parse(redisValue);
      },
    );

    if (parsed.model !== undefined && parsed.pricingTiers !== undefined) {
      const model = redisModelToPrismaModel(parsed.model);
      const pricingTiers: PricingTierWithPrices[] = parsed.pricingTiers.map(
        (tier: any) => ({
          ...tier,
          prices: Object.entries(tier.prices).map(([usageType, price]) => ({
            usageType,
            price: new Decimal(price as string),
          })),
        }),
      );

      return { model, pricingTiers };
    }

    // Unknown format
    logger.warn(
      `Unknown cache format for model match: ${JSON.stringify(parsed)}`,
    );
    return null;
  } catch (error) {
    logger.error(
      `Error getting model for ${JSON.stringify(p)} from Redis`,
      error,
    );
    return null;
  }
};

export async function findPricingTiersForModel(
  modelId: string,
): Promise<PricingTierWithPrices[]> {
  if (!modelId) return [];

  const tiers = await prisma.pricingTier.findMany({
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

  return tiers.map((tier) => ({
    id: tier.id,
    name: tier.name,
    isDefault: tier.isDefault,
    priority: tier.priority,
    conditions: tier.conditions as any, // Cast from JsonValue to PricingTierCondition[]
    prices: tier.prices,
  }));
}

export async function findModelInPostgres(
  p: ModelMatchProps,
): Promise<Model | null> {
  const { projectId, model } = p;
  // either get the model from the existing observation
  // or match pattern on the user provided model name
  const modelCondition = model
    ? Prisma.sql`AND ${model} ~ match_pattern`
    : undefined;
  if (!modelCondition) return null;

  const sql = Prisma.sql`
    SELECT
      id,
      created_at AS "createdAt",
      updated_at AS "updatedAt",
      project_id AS "projectId",
      model_name AS "modelName",
      match_pattern AS "matchPattern",
      start_date AS "startDate",
      input_price AS "inputPrice",
      output_price AS "outputPrice",
      total_price AS "totalPrice",
      unit,
      tokenizer_id AS "tokenizerId",
      tokenizer_config AS "tokenizerConfig"
    FROM
      models
      WHERE (project_id = ${projectId}
      OR project_id IS NULL)
    ${modelCondition}
    ORDER BY
      project_id ASC,
      start_date DESC NULLS LAST
    LIMIT 1
  `;

  const foundModels = await prisma.$queryRaw<Array<Model>>(sql);

  return foundModels[0] ?? null;
}

const NOT_FOUND_TOKEN = "LANGFUSE_MODEL_MATCH_NOT_FOUND" as const;

const addModelNotFoundTokenToRedis = async (p: ModelMatchProps) => {
  try {
    const key = getRedisModelKey(p);
    await redis?.set(
      key,
      NOT_FOUND_TOKEN,
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(
      `Error adding model not found token for ${JSON.stringify(p)} to Redis`,
      error,
    );
  }
};

const addModelWithPricingTiersToRedis = async (
  p: ModelMatchProps,
  model: Model,
  pricingTiers: PricingTierWithPrices[],
) => {
  try {
    const key = getRedisModelKey(p);

    const cachedPricingTiers = pricingTiers.map((tier) => {
      return {
        ...tier,
        prices: Object.fromEntries(
          tier.prices.map((p) => [p.usageType, p.price]),
        ),
      };
    });

    await redis?.set(
      key,
      JSON.stringify({ model, pricingTiers: cachedPricingTiers }),
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(
      `Error adding model with pricing tiers for ${JSON.stringify(p)} to Redis`,
      error,
    );
  }
};

export const getRedisModelKey = (p: ModelMatchProps) => {
  const uriEncodedModel = encodeURIComponent(p.model);
  return `${getModelMatchKeyPrefix()}:${p.projectId}:${uriEncodedModel}`;
};

const getModelMatchKeyPrefix = () => {
  if (env.REDIS_CLUSTER_ENABLED === "true") {
    // Use hash tags for Redis cluster compatibility
    // This ensures all model cache keys are placed on the same hash slot
    return "{model-price-tiers}";
  }
  return "model-price-tiers";
};

export const redisModelToPrismaModel = (redisModel: Model): Model => {
  return {
    ...redisModel,
    createdAt: new Date(redisModel.createdAt),
    updatedAt: new Date(redisModel.updatedAt),
    inputPrice:
      redisModel.inputPrice !== null && redisModel.inputPrice !== undefined
        ? new Decimal(redisModel.inputPrice)
        : null,
    outputPrice:
      redisModel.outputPrice !== null && redisModel.outputPrice !== undefined
        ? new Decimal(redisModel.outputPrice)
        : null,
    totalPrice:
      redisModel.totalPrice !== null && redisModel.totalPrice !== undefined
        ? new Decimal(redisModel.totalPrice)
        : null,
    startDate:
      redisModel.startDate !== null && redisModel.startDate !== undefined
        ? new Date(redisModel.startDate)
        : null,
  };
};

export async function clearModelCacheForProject(
  projectId: string,
): Promise<void> {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false" || !redis) {
    return;
  }

  try {
    const pattern = `${getModelMatchKeyPrefix()}:${projectId}:*`;
    const keys = await scanKeys(redis, pattern);

    if (keys.length > 0) {
      await safeMultiDel(redis, keys);
      logger.info(
        `Cleared ${keys.length} model cache entries for project ${projectId}`,
      );
    }
  } catch (error) {
    logger.error(
      `Error clearing model cache for project ${projectId}: ${error}`,
    );
  }
}

export async function isModelMatchCacheLocked() {
  try {
    return Boolean(await redis?.exists(MODEL_MATCH_CACHE_LOCKED_KEY));
  } catch (err) {
    logger.error("Failed to check whether model match is locked", err);

    return false;
  }
}

export async function clearFullModelCache() {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false" || !redis) {
    return;
  }

  try {
    // Use lock to protect for concurrent executions
    // This function is called on worker startup, so we want to avoid all workers triggering this delete
    if (await isModelMatchCacheLocked()) {
      logger.info("Model cache clearing already in progress; skipping.");

      return;
    }

    const startTime = Date.now();
    logger.info("Clearing full model cache...");

    const tenMinutesInSeconds = 60 * 10;
    await redis.setex(
      MODEL_MATCH_CACHE_LOCKED_KEY,
      tenMinutesInSeconds,
      "locked",
    );

    const pattern = getModelMatchKeyPrefix() + "*";

    const keys = await scanKeys(redis, pattern);

    if (keys.length > 0) {
      await safeMultiDel(redis, keys);
      logger.info(
        `Cleared full model cache with ${keys.length} keys in ${Date.now() - startTime}ms.`,
      );
    } else {
      logger.info(`No keys found for match pattern '${pattern}'`);
    }
  } catch (error) {
    logger.error(`Error clearing full model cache: ${error}`);
  } finally {
    await redis?.del(MODEL_MATCH_CACHE_LOCKED_KEY);
  }
}
