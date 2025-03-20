import { Model, Prisma } from "@prisma/client";
import { logger } from "@langfuse/shared/src/server";
import { redis } from "@langfuse/shared/src/server";
import { prisma } from "@langfuse/shared/src/db";

export type ModelMatchProps = {
  projectId: string;
  model?: string;
};

export async function findModel(p: ModelMatchProps): Promise<Model | null> {
  // try to find model in Redis
  const redisModel = await getModelFromRedis(p);
  if (redisModel) {
    return redisModel;
  }

  // try to find model in Postgres
  const postgresModel = await findModelInPostgres(p);

  if (postgresModel) {
    await addModelToRedis(p, postgresModel);
  }

  return postgresModel;
}

const getModelFromRedis = async (p: ModelMatchProps) => {
  try {
    const redisApiKey = getRedisModelKey(p);
    const redisModel = await redis?.get(redisApiKey);
    if (redisModel) {
      return JSON.parse(redisModel);
    }
  } catch (error) {
    logger.error(
      `Error getting model for ${JSON.stringify(p)} from Redis: ${error}`,
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
    logger.error(
      `Error adding model for ${JSON.stringify(p)} to Redis: ${error}`,
    );
  }
};

export const getRedisModelKey = (p: ModelMatchProps) => {
  return `model-match:${p.projectId}:${JSON.stringify(p)}`;
};
