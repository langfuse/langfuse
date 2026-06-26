import {
  convertClickhouseScoreToDomain,
  parseClickhouseUTCDateTimeFormat,
  scoreDomainToV3,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import type { APIScoreV3 } from "@langfuse/shared";

import {
  encodeExperimentsCursor,
  type GetExperimentsV1QueryType,
} from "@/src/features/public-api/types/experiments";
import { queryExperimentSummariesForPublicApi } from "@/src/features/experiments/server/public/repository";

export type ListExperimentsPublicQuery = GetExperimentsV1QueryType;
type ExperimentSummaryRow = Awaited<
  ReturnType<typeof queryExperimentSummariesForPublicApi>
>[number];

const transformExperimentSummaryRow = (
  row: ExperimentSummaryRow,
  includeMetadata: boolean,
  scores?: APIScoreV3[],
) => {
  const base = {
    id: row.experiment_id,
    name: row.experiment_name,
    description: row.experiment_description ?? null,
    startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
    itemCount: Number(row.item_count),
    datasetId: row.experiment_dataset_id,
  };

  const withOptionalFields = {
    ...base,
    ...(includeMetadata ? { metadata: row.experiment_metadata ?? null } : {}),
    ...(scores ? { scores } : {}),
  };

  return withOptionalFields;
};

const toExperimentScoreV3 = (row: ScoreRecordReadType): APIScoreV3 => {
  const score = convertClickhouseScoreToDomain(row);

  return scoreDomainToV3(score, ["core", "subject"]);
};

const scoreRecordsToV3 = (scores: ScoreRecordReadType[] | null | undefined) =>
  (scores ?? []).map(toExperimentScoreV3);

export async function listExperimentsForPublicApi({
  projectId,
  query,
}: {
  projectId: string;
  query: ListExperimentsPublicQuery;
}) {
  const includeMetadata = query.fields.includes("metadata");
  const includeScores = query.fields.includes("scores");

  const rows = await queryExperimentSummariesForPublicApi({
    projectId,
    id: query.id,
    name: query.name,
    datasetId: query.datasetId,
    fromStartTime: new Date(query.fromStartTime),
    toStartTime: query.toStartTime ? new Date(query.toStartTime) : undefined,
    advancedFilters: query.filter,
    cursor: query.cursor
      ? {
          lastStartTime: query.cursor.lastStartTimeTo,
          lastTraceId: query.cursor.lastTraceId,
          lastId: query.cursor.lastId,
          lastExperimentId: query.cursor.lastExperimentId,
        }
      : undefined,
    includeMetadata,
    includeScores,
    limit: query.limit + 1,
    scoreLimit: query.scoreLimit,
  });

  const hasMore = rows.length > query.limit;
  const rowsToReturn = hasMore ? rows.slice(0, query.limit) : rows;

  const data = rowsToReturn.map((row) =>
    transformExperimentSummaryRow(
      row,
      includeMetadata,
      includeScores ? scoreRecordsToV3(row.scores) : undefined,
    ),
  );

  const lastRow = rowsToReturn[rowsToReturn.length - 1];
  const meta =
    hasMore && lastRow
      ? {
          cursor: encodeExperimentsCursor({
            v: 1,
            lastStartTimeTo: parseClickhouseUTCDateTimeFormat(
              lastRow.start_time,
            ),
            lastTraceId: lastRow.cursor_trace_id,
            lastId: lastRow.cursor_span_id,
            lastExperimentId: lastRow.experiment_id,
          }),
        }
      : {};

  return {
    data,
    meta,
  };
}
