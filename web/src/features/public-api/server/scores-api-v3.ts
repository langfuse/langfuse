import {
  convertClickhouseScoreToDomain,
  convertDateToClickhouseDateTime,
  logger,
  measureAndReturn,
  parseClickhouseUTCDateTimeFormat,
  queryClickhouse,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import type {
  APIScoreV3,
  ScoreDataTypeType,
  ScoreDomain,
  ScoreFieldGroupV3,
} from "@langfuse/shared";
import {
  filterAndValidateV3GetScoreList,
  InternalServerError,
  ScoreDataTypeEnum,
} from "@langfuse/shared";
import {
  encodeCursorV3,
  type ScoresCursorV3Type,
} from "@/src/features/public-api/types/scores";

export function polymorphicValue(score: {
  dataType: ScoreDataTypeType;
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
    default: {
      const _exhaustiveCheck: never = score.dataType;
      throw new InternalServerError(
        `Score has unknown dataType: ${_exhaustiveCheck as string}`,
      );
    }
  }
}

function deriveSubject(score: ScoreDomain): {
  kind: "trace" | "observation" | "session" | "experiment";
  id: string;
  traceId?: string;
} {
  if (score.datasetRunId) {
    return { kind: "experiment", id: score.datasetRunId };
  }
  if (score.observationId) {
    return {
      kind: "observation",
      id: score.observationId,
      ...(score.traceId ? { traceId: score.traceId } : {}),
    };
  }
  if (score.sessionId) {
    return { kind: "session", id: score.sessionId };
  }
  if (!score.traceId) {
    throw new InternalServerError(
      `Score ${score.id} has kind=trace but missing traceId`,
    );
  }
  return { kind: "trace", id: score.traceId };
}

function domainToV3(
  score: ScoreDomain,
  fields: ScoreFieldGroupV3[],
): APIScoreV3 {
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
    ...(fields.includes("details")
      ? {
          details: {
            comment: score.comment,
            configId: score.configId,
            metadata: score.metadata,
          },
        }
      : {}),
    ...(fields.includes("subject") ? { subject: deriveSubject(score) } : {}),
    ...(fields.includes("annotation")
      ? {
          annotation: {
            authorUserId: score.authorUserId,
            queueId: score.queueId,
          },
        }
      : {}),
  } as APIScoreV3;
}

// Always-selected columns map to the core APIScoreV3 fields plus the cursor
// and bookkeeping columns. Optional groups (details/subject/annotation) are
// only selected when their `fields` group is requested — ClickHouse is
// columnar, so skipping unused columns avoids real I/O cost on large rows
// (notably `metadata` and `long_string_value`).
const CORE_COLUMNS = [
  "s.id as id",
  "s.project_id as project_id",
  "s.timestamp as timestamp",
  "s.environment as environment",
  "s.name as name",
  "s.value as value",
  "s.string_value as string_value",
  "s.long_string_value as long_string_value",
  "s.source as source",
  "s.data_type as data_type",
  "s.created_at as created_at",
  "s.updated_at as updated_at",
  "s.execution_trace_id as execution_trace_id",
];
const DETAILS_COLUMNS = [
  "s.comment as comment",
  "s.metadata as metadata",
  "s.config_id as config_id",
];
const SUBJECT_COLUMNS = [
  "s.trace_id as trace_id",
  "s.observation_id as observation_id",
  "s.session_id as session_id",
  "s.dataset_run_id as dataset_run_id",
];
const ANNOTATION_COLUMNS = [
  "s.author_user_id as author_user_id",
  "s.queue_id as queue_id",
];

// Exported only for the unit test in scores-api-v3.servertest.ts that locks
// the SELECT-vs-converter contract — see the corresponding describe block.
export const buildSelectColumns = (fields: ScoreFieldGroupV3[]): string => {
  const selected = [...CORE_COLUMNS];
  if (fields.includes("details")) selected.push(...DETAILS_COLUMNS);
  if (fields.includes("subject")) selected.push(...SUBJECT_COLUMNS);
  if (fields.includes("annotation")) selected.push(...ANNOTATION_COLUMNS);
  return selected.join(",\n    ");
};

const buildV3ListQuery = (withCursor: boolean, fields: ScoreFieldGroupV3[]) => `
  SELECT
    ${buildSelectColumns(fields)}
  FROM scores s
  WHERE s.project_id = {projectId: String}
  ${
    withCursor
      ? "AND (s.timestamp, s.id) < ({lastTimestamp: DateTime64(3)}, {lastId: String})"
      : ""
  }
  ORDER BY s.timestamp DESC, s.id DESC, s.event_ts DESC
  LIMIT 1 BY s.id, s.project_id
  LIMIT {limit: Int32}
`;

export async function listScoresV3ForPublicApi(params: {
  projectId: string;
  limit: number;
  cursor?: ScoresCursorV3Type;
  fields: ScoreFieldGroupV3[];
}): Promise<{ data: APIScoreV3[]; cursor?: string }> {
  return measureAndReturn({
    operationName: "listScoresV3ForPublicApi",
    projectId: params.projectId,
    input: {
      params: {
        projectId: params.projectId,
        limit: params.limit + 1,
        ...(params.cursor && {
          lastTimestamp: convertDateToClickhouseDateTime(
            params.cursor.lastTimestamp,
          ),
          lastId: params.cursor.lastId,
        }),
      },
      tags: {
        feature: "scoring",
        type: "score",
        projectId: params.projectId,
        operation_name: "listScoresV3ForPublicApi",
      },
    },
    fn: async (input) => {
      const records = await queryClickhouse<ScoreRecordReadType>({
        query: buildV3ListQuery(Boolean(params.cursor), params.fields),
        params: input.params,
        tags: input.tags,
        preferredClickhouseService: "ReadOnly",
      });

      const hasMore = records.length > params.limit;
      const pageRecords = hasMore ? records.slice(0, params.limit) : records;

      let nextCursor: string | undefined;
      if (hasMore && pageRecords.length > 0) {
        const last = pageRecords[pageRecords.length - 1];
        nextCursor = encodeCursorV3({
          lastTimestamp: parseClickhouseUTCDateTimeFormat(
            String(last.timestamp),
          ),
          lastId: last.id,
        });
      }

      // Log+drop bad rows rather than 500ing the whole page — domainToV3 can
      // throw (e.g. polymorphicValue's stringValue / longStringValue guards
      // for malformed CATEGORICAL / TEXT / CORRECTION rows, or deriveSubject
      // for a malformed subject record). Mirrors the row-level graceful-drop
      // semantics of filterAndValidateV3GetScoreList.
      const items: ReturnType<typeof domainToV3>[] = [];
      for (const row of pageRecords) {
        try {
          items.push(
            domainToV3(convertClickhouseScoreToDomain(row), params.fields),
          );
        } catch (error) {
          logger.error("v3 score row dropped from response", {
            error,
            scoreId: row.id,
            projectId: params.projectId,
          });
        }
      }
      return {
        data: filterAndValidateV3GetScoreList(items, (error) => {
          logger.error("v3 score row dropped from response", {
            issues: error.issues,
            projectId: params.projectId,
          });
        }),
        cursor: nextCursor,
      };
    },
  });
}
