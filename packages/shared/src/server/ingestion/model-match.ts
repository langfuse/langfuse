import { Model, Observation, Prisma } from "@prisma/client";
import { prisma } from "../../db";

export async function findModel(p: {
  event: {
    projectId: string;
    model?: string;
    unit?: string;
    startTime?: Date;
  };
  existingDbObservation?: Observation;
}): Promise<Model | null> {
  const { event, existingDbObservation } = p;
  // either get the model from the existing observation
  // or match pattern on the user provided model name
  const modelCondition = event.model
    ? Prisma.sql`AND ${event.model} ~ match_pattern`
    : existingDbObservation?.internalModel
      ? Prisma.sql`AND model_name = ${existingDbObservation.internalModel}`
      : undefined;
  if (!modelCondition) return null;

  // unit based on the current event or the existing observation, both can be undefined
  const mergedUnit = event.unit ?? existingDbObservation?.unit;

  const unitCondition = mergedUnit
    ? Prisma.sql`AND unit = ${mergedUnit}`
    : Prisma.empty;

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
    WHERE (project_id = ${event.projectId}
      OR project_id IS NULL)
    ${modelCondition}
    ${unitCondition}
    AND (start_date IS NULL OR start_date <= ${
      event.startTime ? new Date(event.startTime) : new Date()
    }::timestamp with time zone at time zone 'UTC')
    ORDER BY
      project_id ASC,
      start_date DESC NULLS LAST
    LIMIT 1
  `;

  const foundModels = await prisma.$queryRaw<Array<Model>>(sql);

  return foundModels[0] ?? null;
}
