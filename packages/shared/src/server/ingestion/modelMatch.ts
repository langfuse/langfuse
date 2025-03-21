import { env } from "../../env";
import { Model, Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { recordIncrement } from "../instrumentation";
import { logger } from "../logger";
import { redis } from "../redis/redis";
import Decimal from "decimal.js";

export type ModelMatchProps = {
  projectId: string;
  model: string;
};

export async function findModel(p: ModelMatchProps): Promise<Model | null> {
  logger.debug(`Finding model for ${JSON.stringify(p)}`);
  const redisModel = await getModelFromRedis(p);
  if (redisModel) {
    logger.debug(
      `Found model name ${redisModel?.modelName} (id: ${redisModel?.id}) for project ${p.projectId} and model ${p.model}`,
    );
    return redisModel;
  }

  // try to find model in Postgres
  const postgresModel = await findModelInPostgres(p);

  if (postgresModel && env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "true") {
    await addModelToRedis(p, postgresModel);
  }

  logger.debug(
    `Found model name ${postgresModel?.modelName} (id: ${postgresModel?.id}) for project ${p.projectId} and model ${p.model}`,
  );
  return postgresModel;
}

const getModelFromRedis = async (p: ModelMatchProps): Promise<Model | null> => {
  if (env.LANGFUSE_CACHE_MODEL_MATCH_ENABLED === "false") {
    return null;
  }

  try {
    const key = getRedisModelKey(p);
    const redisModel = await redis?.getex(
      key,
      "EX",
      env.LANGFUSE_CACHE_MODEL_MATCH_TTL_SECONDS,
    );
    if (redisModel) {
      recordIncrement("langfuse.model_match.cache_hit", 1);
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

const addModelToRedis = async (p: ModelMatchProps, model: Model) => {
  try {
    const redisApiKey = getRedisModelKey(p);
    await redis?.set(redisApiKey, JSON.stringify(model));
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
  const parsed = JSON.parse(redisModel);
  return {
    ...parsed,
    createdAt: new Date(parsed.createdAt),
    updatedAt: new Date(parsed.updatedAt),
    inputPrice: new Decimal(parsed.inputPrice),
    outputPrice: new Decimal(parsed.outputPrice),
    totalPrice: new Decimal(parsed.totalPrice),
    startDate: parsed.startDate ? new Date(parsed.startDate) : null,
  };
};
