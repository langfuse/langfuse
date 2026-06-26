import {
  convertClickhouseScoreToDomain,
  getCurrentSpan,
  parseClickhouseUTCDateTimeFormat,
  scoreDomainToV3,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import { LangfuseNotFoundError, type APIScoreV3 } from "@langfuse/shared";

import {
  encodeExperimentsCursor,
  type GetExperimentV1QueryType,
  type GetExperimentItemsV1QueryType,
  type GetExperimentsV1QueryType,
} from "@/src/features/public-api/types/experiments";
import {
  queryExperimentItemsForPublicApi,
  queryExperimentSummaryForPublicApi,
  queryExperimentSummariesForPublicApi,
} from "@/src/features/experiments/server/public/repository";

export type GetExperimentPublicQuery = GetExperimentV1QueryType;
export type ListExperimentsPublicQuery = GetExperimentsV1QueryType;
export type ListExperimentItemsPublicQuery = GetExperimentItemsV1QueryType;
type ExperimentSummaryRow = Awaited<
  ReturnType<typeof queryExperimentSummariesForPublicApi>
>[number];
type ExperimentItemRow = Awaited<
  ReturnType<typeof queryExperimentItemsForPublicApi>
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

const transformExperimentDetailRow = (row: ExperimentSummaryRow) => ({
  id: row.experiment_id,
  name: row.experiment_name,
  description: row.experiment_description ?? null,
  startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
  itemCount: Number(row.item_count),
  datasetId: row.experiment_dataset_id,
  metadata: row.experiment_metadata ?? null,
  scores: scoreRecordsToV3(row.scores ?? []),
});

const toExperimentScoreV3 = (row: ScoreRecordReadType): APIScoreV3 => {
  const score = convertClickhouseScoreToDomain(row);

  return scoreDomainToV3(score, ["core", "subject"]);
};

const scoreRecordsToV3 = (scores: ScoreRecordReadType[]) =>
  scores.map(toExperimentScoreV3);

const transformExperimentItemRow = (
  row: ExperimentItemRow,
  options: {
    includeDataset: boolean;
    includeIo: boolean;
    includeMetadata: boolean;
    includeItemMetadata: boolean;
    includeExperimentMetadata: boolean;
    scores?: APIScoreV3[];
  },
) => {
  const base = {
    id: row.id,
    traceId: row.trace_id,
    startTime: parseClickhouseUTCDateTimeFormat(row.start_time),
    endTime: row.end_time
      ? parseClickhouseUTCDateTimeFormat(row.end_time)
      : null,
    level: row.level,
    environment: row.environment,
    experimentId: row.experiment_id,
    experimentName: row.experiment_name ?? "",
    experimentItemId: row.experiment_item_id,
  };

  return {
    ...base,
    ...(options.includeDataset
      ? {
          experimentDatasetId: row.experiment_dataset_id ?? null,
          experimentItemVersion: row.experiment_item_version
            ? parseClickhouseUTCDateTimeFormat(row.experiment_item_version)
            : null,
        }
      : {}),
    ...(options.includeIo
      ? {
          input: row.input,
          output: row.output,
          expectedOutput: row.experiment_item_expected_output,
        }
      : {}),
    ...(options.includeMetadata ? { metadata: row.metadata ?? null } : {}),
    ...(options.includeItemMetadata
      ? { experimentItemMetadata: row.experiment_item_metadata ?? null }
      : {}),
    ...(options.includeExperimentMetadata
      ? {
          experimentMetadata: row.experiment_metadata ?? null,
          experimentDescription: row.experiment_description ?? null,
        }
      : {}),
    ...(options.scores ? { scores: options.scores } : {}),
  };
};

export async function listExperimentsForPublicApi({
  projectId,
  query,
}: {
  projectId: string;
  query: ListExperimentsPublicQuery;
}) {
  const includeMetadata = query.fields.includes("metadata");
  const includeScores = query.fields.includes("scores");

  getCurrentSpan()?.setAttributes({
    "langfuse.query.include_metadata": includeMetadata,
    "langfuse.query.include_scores": includeScores,
  });

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
      includeScores ? scoreRecordsToV3(row.scores ?? []) : undefined,
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

export async function getExperimentForPublicApi({
  projectId,
  query,
}: {
  projectId: string;
  query: GetExperimentPublicQuery;
}) {
  const row = await queryExperimentSummaryForPublicApi({
    projectId,
    experimentId: query.experimentId,
  });

  if (!row) {
    throw new LangfuseNotFoundError(
      `Experiment ${query.experimentId} not found within authorized project`,
    );
  }

  return transformExperimentDetailRow(row);
}

export async function listExperimentItemsForPublicApi({
  projectId,
  query,
}: {
  projectId: string;
  query: ListExperimentItemsPublicQuery;
}) {
  const includeDataset = query.fields.includes("dataset");
  const includeIo = query.fields.includes("io");
  const includeMetadata = query.fields.includes("metadata");
  const includeItemMetadata = query.fields.includes("itemMetadata");
  const includeExperimentMetadata = query.fields.includes("experimentMetadata");
  const includeScores = query.fields.includes("scores");

  getCurrentSpan()?.setAttributes({
    "langfuse.query.include_dataset": includeDataset,
    "langfuse.query.include_io": includeIo,
    "langfuse.query.include_metadata": includeMetadata,
    "langfuse.query.include_item_metadata": includeItemMetadata,
    "langfuse.query.include_experiment_metadata": includeExperimentMetadata,
    "langfuse.query.include_scores": includeScores,
  });

  const rows = await queryExperimentItemsForPublicApi({
    projectId,
    fromStartTime: query.fromStartTime
      ? new Date(query.fromStartTime)
      : undefined,
    toStartTime: query.toStartTime ? new Date(query.toStartTime) : undefined,
    experimentId: query.experimentId,
    experimentName: query.experimentName,
    experimentItemId: query.experimentItemId,
    datasetId: query.datasetId,
    advancedFilters: query.filter,
    cursor: query.cursor
      ? {
          lastStartTime: query.cursor.lastStartTimeTo,
          lastTraceId: query.cursor.lastTraceId,
          lastId: query.cursor.lastId,
          lastExperimentId: query.cursor.lastExperimentId,
        }
      : undefined,
    includeDataset,
    includeIo,
    includeMetadata,
    includeItemMetadata,
    includeExperimentMetadata,
    includeScores,
    limit: query.limit + 1,
    scoreLimit: query.scoreLimit,
  });

  const hasMore = rows.length > query.limit;
  const rowsToReturn = hasMore ? rows.slice(0, query.limit) : rows;

  const data = rowsToReturn.map((row) => {
    return transformExperimentItemRow(row, {
      includeDataset,
      includeIo,
      includeMetadata,
      includeItemMetadata,
      includeExperimentMetadata,
      scores: includeScores ? scoreRecordsToV3(row.scores ?? []) : undefined,
    });
  });

  const lastRow = rowsToReturn[rowsToReturn.length - 1];
  const meta =
    hasMore && lastRow
      ? {
          cursor: encodeExperimentsCursor({
            v: 1,
            lastStartTimeTo: parseClickhouseUTCDateTimeFormat(
              lastRow.start_time,
            ),
            lastTraceId: lastRow.trace_id,
            lastId: lastRow.id,
            lastExperimentId: lastRow.experiment_id,
          }),
        }
      : {};

  return {
    data,
    meta,
  };
}
