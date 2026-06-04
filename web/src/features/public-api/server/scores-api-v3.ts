import {
  convertClickhouseScoreToDomain,
  measureAndReturn,
  queryClickhouse,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import type { APIScoreV3, ScoreDomain } from "@langfuse/shared";
import { InternalServerError, ScoreDataTypeEnum } from "@langfuse/shared";

export function polymorphicValue(score: {
  dataType: string;
  value: number;
  stringValue?: string | null;
  longStringValue?: string | null;
}): number | boolean | string {
  switch (score.dataType) {
    case ScoreDataTypeEnum.NUMERIC:
      return score.value;
    case ScoreDataTypeEnum.BOOLEAN:
      return score.value === 1;
    case ScoreDataTypeEnum.CATEGORICAL:
    case ScoreDataTypeEnum.TEXT:
      if (score.stringValue == null) {
        throw new InternalServerError(
          `Score with dataType ${score.dataType} is missing its stringValue`,
        );
      }
      return score.stringValue;
    case ScoreDataTypeEnum.CORRECTION:
      if (score.longStringValue == null) {
        throw new InternalServerError(
          "Score with dataType CORRECTION is missing its longStringValue",
        );
      }
      return score.longStringValue;
    default:
      throw new InternalServerError(
        `Score has unknown dataType: ${score.dataType}`,
      );
  }
}

function domainToV3(score: ScoreDomain): APIScoreV3 {
  // ScoreDomain is a flat type so TypeScript cannot verify that dataType and
  // value are a valid discriminated pair; polymorphicValue guarantees it at runtime.
  return {
    id: score.id,
    projectId: score.projectId,
    name: score.name,
    dataType: score.dataType,
    value: polymorphicValue({
      dataType: score.dataType,
      value: score.value,
      stringValue: score.stringValue as string | null | undefined,
      longStringValue: score.longStringValue as string | null | undefined,
    }),
    source: score.source,
    timestamp: score.timestamp,
    environment: score.environment,
    createdAt: score.createdAt,
    updatedAt: score.updatedAt,
  } as APIScoreV3;
}

const v3ListQuery = `
  SELECT
    s.id as id,
    s.project_id as project_id,
    s.timestamp as timestamp,
    s.environment as environment,
    s.name as name,
    s.value as value,
    s.string_value as string_value,
    s.long_string_value as long_string_value,
    s.author_user_id as author_user_id,
    s.created_at as created_at,
    s.updated_at as updated_at,
    s.source as source,
    s.comment as comment,
    s.metadata as metadata,
    s.data_type as data_type,
    s.config_id as config_id,
    s.queue_id as queue_id,
    s.execution_trace_id as execution_trace_id,
    s.trace_id as trace_id,
    s.observation_id as observation_id,
    s.session_id as session_id,
    s.dataset_run_id as dataset_run_id,
    s.is_deleted as is_deleted
  FROM scores s
  WHERE s.project_id = {projectId: String}
  ORDER BY s.timestamp DESC, s.event_ts DESC, s.id DESC
  LIMIT 1 BY s.id, s.project_id
  LIMIT {limit: Int32}
`;

export async function listScoresV3ForPublicApi(params: {
  projectId: string;
  limit: number;
}): Promise<APIScoreV3[]> {
  return measureAndReturn({
    operationName: "listScoresV3ForPublicApi",
    projectId: params.projectId,
    input: {
      params: { projectId: params.projectId, limit: params.limit },
      tags: {
        feature: "scoring",
        type: "score",
        projectId: params.projectId,
        operation_name: "listScoresV3ForPublicApi",
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<ScoreRecordReadType>({
        query: v3ListQuery,
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });
      return records.map((row) =>
        domainToV3(convertClickhouseScoreToDomain(row)),
      );
    },
  });
}
