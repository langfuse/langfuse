import { Model, Price, Prisma } from "../../";
import {
  instrumentAsync,
  logger,
  recordIncrement,
  redis,
  safeMultiDel,
} from "../";
import { type Cluster } from "ioredis";
import { env } from "../../env";
import { Decimal } from "decimal.js";
import { prisma } from "../../db";

export type ModelMatchProps = {
  projectId: string;
  model: string;
};

export type ModelWithPrices = {
  model: Model | null;
  prices: Price[];
};

const MODEL_MATCH_CACHE_LOCKED_KEY = "LOCK:model-match-clear";

export async function findModel(p: ModelMatchProps): Promise<ModelWithPrices> {
  return instrumentAsync(
    {
      name: "model-match",
      traceScope: "model-match",
    },
    async (span) => {
      logger.debug(`Finding model for ${JSON.stringify(p)}`);
      const cachedResult = await getModelWithPricesFromRedis(p);
      if (cachedResult) {
        span.setAttribute("model_match_source", "redis");

        if (cachedResult.model === null) {
          return { model: null, prices: [] };
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
        const prices = await findPricesForModel(postgresModel.id);
        await addModelWithPricesToRedis(p, postgresModel, prices);

        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "true");

        logger.debug(
          `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
        );
        return { model: postgresModel, prices };
      } else if (postgresModel) {
        const prices = await findPricesForModel(postgresModel.id);
        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "false");

        logger.debug(
          `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
        );
        return { model: postgresModel, prices };
      } else {
        span.setAttribute("model_match_source", "none");

        if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
          await addModelNotFoundTokenToRedis(p);
          span.setAttribute("model_cache_set", "true");
        }

        logger.debug(
          `Model not found for project ${p.projectId} and model ${p.model}`,
        );
        return { model: null, prices: [] };
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
      return { model: null, prices: [] };
    }

    const parsed = JSON.parse(redisValue);

    // NEW FORMAT: { model: {...}, prices: [...] }
    if (parsed.model !== undefined && parsed.prices !== undefined) {
      const model = redisModelToPrismaModel(JSON.stringify(parsed.model));
      const prices = parsed.prices.map(
        (p: any): Price => ({
          ...p,
          price: new Decimal(p.price),
          createdAt: new Date(p.createdAt),
          updatedAt: new Date(p.updatedAt),
        }),
      );
      return { model, prices };
    }

    // OLD FORMAT: just the model (backwards compatible)
    // Fetch prices and update cache
    const model = redisModelToPrismaModel(redisValue);
    const prices = await findPricesForModel(model.id);

    // Update cache with new format asynchronously (don't await)
    if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
      addModelWithPricesToRedis(p, model, prices).catch((error) => {
        logger.error(
          `Error updating cache with prices for ${JSON.stringify(p)}`,
          error,
        );
      });
    }

    return { model, prices };
  } catch (error) {
    logger.error(
      `Error getting model for ${JSON.stringify(p)} from Redis`,
      error,
    );
    return null;
  }
};

export async function findPricesForModel(modelId: string): Promise<Price[]> {
  return (await prisma.price.findMany({ where: { modelId } })) ?? [];
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

const addModelWithPricesToRedis = async (
  p: ModelMatchProps,
  model: Model,
  prices: Price[],
) => {
  try {
    const key = getRedisModelKey(p);
    await redis?.set(
      key,
      JSON.stringify({ model, prices }),
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(
      `Error adding model with prices for ${JSON.stringify(p)} to Redis`,
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
    return "{model-match}";
  }
  return "model-match";
};

export const redisModelToPrismaModel = (redisModel: string): Model => {
  const parsed: Model = JSON.parse(redisModel);
  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
    inputPrice:
      parsed.inputPrice !== null && parsed.inputPrice !== undefined
        ? new Decimal(parsed.inputPrice)
        : null,
    outputPrice:
      parsed.outputPrice !== null && parsed.outputPrice !== undefined
        ? new Decimal(parsed.outputPrice)
        : null,
    totalPrice:
      parsed.totalPrice !== null && parsed.totalPrice !== undefined
        ? new Decimal(parsed.totalPrice)
        : null,
    startDate:
      parsed.startDate !== null && parsed.startDate !== undefined
        ? new Date(parsed.startDate)
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

    const keys =
      env.REDIS_CLUSTER_ENABLED === "true"
        ? (
            await Promise.all(
              (redis as Cluster)
                .nodes("master")
                .map((node) => node.keys(pattern) || []),
            )
          ).flat()
        : await redis.keys(pattern);

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

    const keys =
      env.REDIS_CLUSTER_ENABLED === "true"
        ? (
            await Promise.all(
              (redis as Cluster)
                .nodes("master")
                .map((node) => node.keys(pattern) || []),
            )
          ).flat()
        : await redis.keys(pattern);

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
