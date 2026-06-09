import {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunsTableMetricsCh,
  getScoresForExperiments,
  getTraceScoresForDatasetRuns,
  getDatasetRunItemsWithoutIOByItemIds,
  createDatasetRunItem,
  getDatasetItemIdsWithRunData,
  createDatasetItem,
  createManyDatasetItems,
} from "@langfuse/shared/src/server";
import { v4 } from "uuid";
import { prisma } from "@langfuse/shared/src/db";
import {
  createObservation,
  createTraceScore,
  createTrace,
} from "@langfuse/shared/src/server";
import {
  enrichAndMapToDatasetItemId,
  getRunItemsByRunIdOrItemId,
} from "@/src/features/datasets/server/service";
import {
  aggregateScores,
  composeAggregateScoreKey,
} from "@/src/features/scores/lib/aggregateScores";

const projectId = "7a88fb47-b4e2-43b8-a06c-a5ce950dc53a";

process.env.LANGFUSE_DATASET_SERVICE_READ_FROM_VERSIONED_IMPLEMENTATION =
  "true";
process.env.LANGFUSE_DATASET_SERVICE_WRITE_TO_VERSIONED_IMPLEMENTATION = "true";

export {
  createDatasetRunItemsCh,
  createObservationsCh,
  createScoresCh,
  createTracesCh,
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunsTableMetricsCh,
  getScoresForExperiments,
  getTraceScoresForDatasetRuns,
  getDatasetRunItemsWithoutIOByItemIds,
  createDatasetRunItem,
  getDatasetItemIdsWithRunData,
  createDatasetItem,
  createManyDatasetItems,
  v4,
  prisma,
  createObservation,
  createTraceScore,
  createTrace,
  enrichAndMapToDatasetItemId,
  getRunItemsByRunIdOrItemId,
  aggregateScores,
  composeAggregateScoreKey,
  projectId,
};
