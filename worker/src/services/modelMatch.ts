import { Model, Prisma } from "@langfuse/shared";
import {
  instrumentAsync,
  logger,
  recordIncrement,
} from "@langfuse/shared/src/server";
import { env } from "../env";
import { redis } from "@langfuse/shared/src/server";
import { Decimal } from "decimal.js";
import { prisma } from "@langfuse/shared/src/db";

export type ModelMatchProps = {
  projectId: string;
  model: string;
};

export async function findModel(p: ModelMatchProps): Promise<Model | null> {
  return instrumentAsync(
    {
      name: "model-match",
      traceScope: "model-match",
    },
    async (span) => {
      logger.debug(`Finding model for ${JSON.stringify(p)}`);
      const redisModel = await getModelFromRedis(p);
      if (redisModel) {
        span.setAttribute("model_match_source", "redis");

        if (redisModel === NOT_FOUND_TOKEN) {
          return null;
        } else {
          logger.debug(
            `Found model name ${redisModel?.modelName} (id: ${redisModel?.id}) for project ${p.projectId} and model ${p.model}`,
          );
          span.setAttribute("matched_model_id", redisModel.id);
        }

        return redisModel;
      }

      // try to find model in Postgres
      const postgresModel = await findModelInPostgres(p);

      if (postgresModel && env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
        await addModelToRedis(p, postgresModel);

        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "true");
      } else if (postgresModel) {
        span.setAttribute("matched_model_id", postgresModel.id);
        span.setAttribute("model_match_source", "postgres");
        span.setAttribute("model_cache_set", "false");
      } else {
        span.setAttribute("model_match_source", "none");

        if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
          await addModelNotFoundTokenToRedis(p);
          span.setAttribute("model_cache_set", "true");
        }
      }

      logger.debug(
        `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
      );
      return postgresModel;
    },
  );
}

const getModelFromRedis = async (
  p: ModelMatchProps,
): Promise<Model | typeof NOT_FOUND_TOKEN | null> => {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false") {
    return null;
  }

  try {
    const key = getRedisModelKey(p);
    const redisModel = await redis?.get(key);
    if (redisModel) {
      recordIncrement("langfuse.model_match.cache_hit", 1);
      if (redisModel === NOT_FOUND_TOKEN) {
        return null;
      }
      const model = redisModelToPrismaModel(redisModel);
      return model;
    }
    recordIncrement("langfuse.model_match.cache_miss", 1);
    return null;
  } catch (error) {
    logger.error(
      `Error getting model for ${JSON.stringify(p)} from Redis`,
      error,
    );
    return null;
  }
};

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

const addModelToRedis = async (p: ModelMatchProps, model: Model) => {
  try {
    const key = getRedisModelKey(p);
    await redis?.set(
      key,
      JSON.stringify(model),
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
  } catch (error) {
    logger.error(`Error adding model for ${JSON.stringify(p)} to Redis`, error);
  }
};

export const getRedisModelKey = (p: ModelMatchProps) => {
  const uriEncodedModel = encodeURIComponent(p.model);
  return `${getModelMatchKeyPrefix()}:${p.projectId}:${uriEncodedModel}`;
};

const getModelMatchKeyPrefix = () => {
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
