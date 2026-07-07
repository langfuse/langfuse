import {
  addTagsToCurrentSpan,
  convertClickhouseScoreToDomain,
  logger,
  parseClickhouseUTCDateTimeFormat,
  scoreDomainToV3,
  type ScoreRecordReadType,
} from "@langfuse/shared/src/server";
import { type APIScoreV3 } from "@langfuse/shared";

import {
  encodeExperimentCursor,
  type GetExperimentItemsV1QueryType,
  type GetExperimentsV1QueryType,
} from "@/src/features/public-api/types/experiments";
import {
  queryExperimentItemsForPublicApi,
  queryExperimentSummariesForPublicApi,
} from "@/src/features/experiments/server/public/repository";

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
    endTime: parseClickhouseUTCDateTimeFormat(row.end_time),
    itemCount: Number(row.item_count),
    datasetId: row.experiment_dataset_id || null,
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

const scoreRecordsToV3 = (scores: ScoreRecordReadType[], projectId: string) => {
  const items: APIScoreV3[] = [];

  for (const row of scores) {
    try {
      items.push(toExperimentScoreV3(row));
    } catch (error) {
      logger.error(
        "experiments score row dropped from response: conversion error",
        {
          error,
          scoreId: row.id,
          projectId,
        },
      );
    }
  }

  return items;
};

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
          experimentDatasetId: row.experiment_dataset_id || null,
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

  addTagsToCurrentSpan({
    "langfuse.query.include_metadata": includeMetadata,
    "langfuse.query.include_scores": includeScores,
  });

  const rows = await queryExperimentSummariesForPublicApi({
    projectId,
    id: query.id,
    name: query.name,
    datasetId: query.datasetId,
    fromTime: new Date(query.fromStartTime),
    toTime: query.toStartTime ? new Date(query.toStartTime) : undefined,
    advancedFilters: query.filter,
    cursor: query.cursor
      ? {
          lastTime: query.cursor.lastTime,
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
      includeScores ? scoreRecordsToV3(row.scores ?? [], projectId) : undefined,
    ),
  );

  const lastRow = rowsToReturn.at(-1);
  const meta =
    hasMore && lastRow
      ? {
          cursor: encodeExperimentCursor({
            v: 1,
            // The cursor anchors on the phase-1 latest-event key, not the
            // surfaced startTime, so pagination stays on the page ordering.
            lastTime: lastRow.cursor_time,
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

  addTagsToCurrentSpan({
    "langfuse.query.include_dataset": includeDataset,
    "langfuse.query.include_io": includeIo,
    "langfuse.query.include_metadata": includeMetadata,
    "langfuse.query.include_item_metadata": includeItemMetadata,
    "langfuse.query.include_experiment_metadata": includeExperimentMetadata,
    "langfuse.query.include_scores": includeScores,
  });

  const rows = await queryExperimentItemsForPublicApi({
    projectId,
    fromTime: new Date(query.fromStartTime),
    toTime: query.toStartTime ? new Date(query.toStartTime) : undefined,
    experimentId: query.experimentId,
    experimentName: query.experimentName,
    experimentItemId: query.experimentItemId,
    datasetId: query.datasetId,
    advancedFilters: query.filter,
    cursor: query.cursor
      ? {
          lastTime: query.cursor.lastTime,
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
      scores: includeScores
        ? scoreRecordsToV3(row.scores ?? [], projectId)
        : undefined,
    });
  });

  const lastRow = rowsToReturn.at(-1);
  const meta =
    hasMore && lastRow
      ? {
          cursor: encodeExperimentCursor({
            v: 1,
            lastTime: lastRow.start_time,
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
