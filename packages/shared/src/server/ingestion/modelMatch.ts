/* eslint-disable @typescript-eslint/no-use-before-define */
import { randomBytes } from "crypto";
import { Model, Prisma } from "../../";
import { instrumentAsync, logger, recordIncrement, redis } from "../";
import { LocalCache } from "../cache/localCache";
import { env } from "../../env";
import { Decimal } from "decimal.js";
import { prisma } from "../../db";
import type { PricingTierWithPrices } from "../pricing-tiers/types";
import { modelScopeRankSql, visibleModelsSql } from "./modelVisibility";

export type ModelMatchProps = {
  projectId: string;
  model: string;
};

export type ModelWithPrices = {
  model: Model | null;
  pricingTiers: PricingTierWithPrices[];
};

/**
 * Cache entries live in a namespace made of a global epoch (rotated when
 * default prices change) and a per-project epoch (rotated when the project's
 * visible models change). Clearing rotates an epoch; entries of the old
 * namespace are never read again and expire through their TTL.
 *
 * A missing epoch is a valid state, not a miss: when neither epoch exists the
 * key is `<prefix>:<projectId>:<model>`, so entries cached before epochs
 * existed stay hits. Reads therefore never create epochs, and an epoch must
 * outlive every entry written before it existed.
 */
type ModelMatchEpochs = { global: string | null; project: string | null };

const PROJECT_EPOCH_TTL_SECONDS = Math.max(
  7 * 24 * 60 * 60,
  2 * env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
);
const GLOBAL_EPOCH_TTL_SECONDS = Math.max(
  30 * 24 * 60 * 60,
  2 * env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
);
const DEFAULT_LOCAL_CACHE_MODEL_MATCH_TTL_MS = 10_000;
const DEFAULT_LOCAL_CACHE_MODEL_MATCH_MAX = 20_000;
// This L1 cache is intentionally TTL-only. Cross-container consistency continues
// to come from Redis invalidation plus the short local TTL.
const modelMatchLocalCache = new LocalCache<ModelWithPrices>({
  namespace: "model_match",
  enabled: env.LANGFUSE_LOCAL_CACHE_MODEL_MATCH_ENABLED === "true",
  ttlMs: getPositiveNumberOrDefault(
    env.LANGFUSE_LOCAL_CACHE_MODEL_MATCH_TTL_MS,
    DEFAULT_LOCAL_CACHE_MODEL_MATCH_TTL_MS,
  ),
  max: getPositiveNumberOrDefault(
    env.LANGFUSE_LOCAL_CACHE_MODEL_MATCH_MAX,
    DEFAULT_LOCAL_CACHE_MODEL_MATCH_MAX,
  ),
});

export async function findModel(p: ModelMatchProps): Promise<ModelWithPrices> {
  return instrumentAsync(
    {
      name: "model-match",
      traceScope: "model-match",
    },
    async (span) => {
      if (logger.isLevelEnabled("debug")) {
        logger.debug(
          formatModelMatchDebugMessage("Resolving model match", {
            projectId: p.projectId,
            model: p.model,
            localCacheEnabled:
              env.LANGFUSE_LOCAL_CACHE_MODEL_MATCH_ENABLED === "true",
            redisCacheEnabled:
              env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true",
          }),
        );
      }
      const localCacheKey = buildRedisModelKey(p, NO_EPOCHS);
      const { source, value } = await modelMatchLocalCache.getOrLoad(
        localCacheKey,
        async () => {
          // Resolved before Postgres so a fill that races a clear is written
          // into the namespace the clear has just retired.
          const epochs =
            env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true"
              ? await getModelMatchEpochs(p.projectId)
              : null;
          const redisKey = epochs ? buildRedisModelKey(p, epochs) : null;
          const cachedResult = redisKey
            ? await getModelWithPricesFromRedis(p, redisKey)
            : null;
          if (cachedResult) {
            return {
              value: cachedResult,
              source: "redis",
            };
          }

          const postgresModel = await findModelInPostgres(p);
          if (postgresModel) {
            const pricingTiers = await findPricingTiersForModel(
              postgresModel.id,
            );

            if (redisKey) {
              await addModelWithPricingTiersToRedis(
                redisKey,
                postgresModel,
                pricingTiers,
              );
            }

            return {
              value: { model: postgresModel, pricingTiers },
              source: "postgres",
            };
          }

          if (redisKey) {
            await addModelNotFoundTokenToRedis(redisKey);
          }

          return {
            value: { model: null, pricingTiers: [] },
            source: "none",
          };
        },
      );

      if (!value || value.model === null) {
        span.setAttribute("model_match_source", source ?? "none");
        if (
          source === "none" &&
          env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true"
        ) {
          span.setAttribute("model_cache_set", "true");
        }

        if (logger.isLevelEnabled("debug")) {
          logger.debug(
            formatModelMatchDebugMessage(
              "Model match resolved without a model",
              {
                projectId: p.projectId,
                model: p.model,
                source: source ?? "none",
                pricingTierCount: 0,
              },
            ),
          );
        }

        return { model: null, pricingTiers: [] };
      }

      span.setAttribute("model_match_source", source ?? "unknown");
      span.setAttribute("matched_model_id", value.model.id);
      if (source === "postgres") {
        span.setAttribute(
          "model_cache_set",
          String(env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true"),
        );
      }

      if (logger.isLevelEnabled("debug")) {
        logger.debug(
          formatModelMatchDebugMessage("Model match resolved", {
            projectId: p.projectId,
            model: p.model,
            source: source ?? "unknown",
            matchedModelId: value.model.id,
            matchedModelName: value.model.modelName,
            pricingTierCount: value.pricingTiers.length,
          }),
        );
      }
      return value;
    },
  );
}

const formatModelMatchDebugMessage = (
  message: string,
  metadata: Record<string, unknown>,
): string => {
  try {
    return `${message} ${JSON.stringify(metadata)}`;
  } catch {
    return `${message} [unserializable]`;
  }
};

function getPositiveNumberOrDefault(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const clearModelMatchLocalCache = (): void => {
  modelMatchLocalCache.clear();
};

const getModelWithPricesFromRedis = async (
  p: ModelMatchProps,
  key: string,
): Promise<ModelWithPrices | null> => {
  try {
    const redisValue = await redis?.get(key);
    if (!redisValue) {
      recordIncrement("langfuse.model_match.cache_miss", 1);
      return null;
    }

    recordIncrement("langfuse.model_match.cache_hit", 1);

    if (redisValue === NOT_FOUND_TOKEN) {
      return { model: null, pricingTiers: [] };
    }

    const parsed = JSON.parse(redisValue);

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
      scope,
      project_id AS "projectId",
      organization_id AS "organizationId",
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
    WHERE ${visibleModelsSql(projectId)}
    ${modelCondition}
    -- Scope wins over pattern specificity: any matching project model beats
    -- any matching organization model, which beats any Langfuse model.
    ORDER BY
      ${modelScopeRankSql()},
      start_date DESC NULLS LAST,
      updated_at DESC,
      id
    LIMIT 1
  `;

  const foundModels = await prisma.$queryRaw<Array<Model>>(sql);

  return foundModels[0] ?? null;
}

const NOT_FOUND_TOKEN = "LANGFUSE_MODEL_MATCH_NOT_FOUND" as const;

const addModelNotFoundTokenToRedis = async (key: string) => {
  try {
    await redis?.set(
      key,
      NOT_FOUND_TOKEN,
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(
      `Error adding model not found token for ${key} to Redis`,
      error,
    );
  }
};

const addModelWithPricingTiersToRedis = async (
  key: string,
  model: Model,
  pricingTiers: PricingTierWithPrices[],
) => {
  try {
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
      `Error adding model with pricing tiers for ${key} to Redis`,
      error,
    );
  }
};

const NO_EPOCHS: ModelMatchEpochs = { global: null, project: null };

const buildRedisModelKey = (p: ModelMatchProps, epochs: ModelMatchEpochs) => {
  // Encoded model names contain no ":", so the namespace segment is unambiguous.
  const uriEncodedModel = encodeURIComponent(p.model);
  const projectKey = `${getModelMatchKeyPrefix()}:${p.projectId}`;
  if (epochs.global === null && epochs.project === null) {
    return `${projectKey}:${uriEncodedModel}`;
  }
  return `${projectKey}:${epochs.global ?? "-"}.${epochs.project ?? "-"}:${uriEncodedModel}`;
};

/** Redis key under which a match for `p` is currently cached. */
export const getRedisModelKey = async (p: ModelMatchProps) => {
  const epochs = await getModelMatchEpochs(p.projectId);
  return epochs ? buildRedisModelKey(p, epochs) : null;
};

const getGlobalEpochKey = () => `${getModelMatchKeyPrefix()}:epoch:global`;

const getProjectEpochKey = (projectId: string) =>
  `${getModelMatchKeyPrefix()}:epoch:project:${projectId}`;

const newEpochToken = () => randomBytes(6).toString("base64url");

/** Returns null when Redis is unavailable, so callers skip the cache. */
const getModelMatchEpochs = async (
  projectId: string,
): Promise<ModelMatchEpochs | null> => {
  if (!redis) return null;

  try {
    // Both keys share the prefix hash tag, so MGET is valid on a cluster.
    const [global, project] = await redis.mget(
      getGlobalEpochKey(),
      getProjectEpochKey(projectId),
    );
    return { global: global ?? null, project: project ?? null };
  } catch (error) {
    logger.error(`Error reading model cache epochs for ${projectId}`, error);
    return null;
  }
};

const getModelMatchKeyPrefix = () => {
  if (env.REDIS_CLUSTER_ENABLED === "true") {
    // Use hash tags for Redis cluster compatibility
    // This ensures all model cache keys are placed on the same hash slot
    return "{model-price-tiers}";
  }
  return "model-price-tiers";
};

export const redisModelToPrismaModel = (
  redisModel: Omit<Model, "scope" | "organizationId"> & {
    scope?: Model["scope"];
    organizationId?: Model["organizationId"];
  },
): Model => {
  return {
    ...redisModel,
    // Entries cached before the scope or organization columns existed only ever held project or Langfuse rows.
    scope: redisModel.scope ?? (redisModel.projectId ? "PROJECT" : "LANGFUSE"),
    organizationId: redisModel.organizationId ?? null,
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
    await redis.set(
      getProjectEpochKey(projectId),
      newEpochToken(),
      "EX",
      PROJECT_EPOCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(
      `Error clearing model cache for project ${projectId}: ${error}`,
    );
  }
}

/**
 * Clears cached matches of every project in the organization. Call after
 * changing an organization's model definitions.
 */
export async function clearModelCacheForOrganization(
  orgId: string,
): Promise<void> {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false" || !redis) {
    return;
  }

  try {
    const projects = await prisma.project.findMany({
      where: { orgId },
      select: { id: true },
    });
    if (projects.length === 0) return;

    // Epoch keys share the prefix hash tag, so one pipeline is valid on a cluster.
    const pipeline = redis.pipeline();
    for (const { id } of projects) {
      pipeline.set(
        getProjectEpochKey(id),
        newEpochToken(),
        "EX",
        PROJECT_EPOCH_TTL_SECONDS,
      );
    }
    const results = await pipeline.exec();
    const failed = results?.find(([error]) => error);
    if (failed) throw failed[0];
  } catch (error) {
    logger.error(
      `Error clearing model cache for organization ${orgId}: ${error}`,
    );
  }
}

/**
 * Retires every cached match. Runs on each worker start, so concurrent starts
 * may rotate the epoch more than once; each rotation only costs cache misses.
 */
export async function clearFullModelCache() {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false" || !redis) {
    return;
  }

  try {
    await redis.set(
      getGlobalEpochKey(),
      newEpochToken(),
      "EX",
      GLOBAL_EPOCH_TTL_SECONDS,
    );
    logger.info("Cleared full model cache.");
  } catch (error) {
    logger.error(`Error clearing full model cache: ${error}`);
  }
}
