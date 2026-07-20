import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchActionType,
  BatchTableNames,
  type FilterCondition,
} from "@langfuse/shared";

const mocks = vi.hoisted(() => {
  const emptyStream = () =>
    (async function* (): AsyncGenerator<Record<string, unknown>> {
      // Intentionally empty.
    })();

  return {
    applyCommentFilters: vi.fn(),
    getEventsStreamForAnnotationQueue: vi.fn(emptyStream),
    getEventsStreamForDataset: vi.fn(emptyStream),
    getEventsStreamForEval: vi.fn(emptyStream),
    getObservationStream: vi.fn(emptyStream),
    findEvaluators: vi.fn(),
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobConfiguration: { findMany: mocks.findEvaluators },
    batchAction: { update: vi.fn().mockResolvedValue(undefined) },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  applyCommentFilters: mocks.applyCommentFilters,
  getEventsStreamForEval: mocks.getEventsStreamForEval,
  getCurrentSpan: vi.fn(() => undefined),
  logger: { info: vi.fn(), error: vi.fn() },
  CreateEvalQueue: { getInstance: vi.fn() },
  findDatasetIdsForBatchDeletion: vi.fn(),
  traceDeletionProcessor: vi.fn(),
}));

vi.mock("../features/database-read-stream/event-stream", () => ({
  getEventsStreamForAnnotationQueue: mocks.getEventsStreamForAnnotationQueue,
  getEventsStreamForDataset: mocks.getEventsStreamForDataset,
}));

vi.mock("../features/database-read-stream/observation-stream", () => ({
  getObservationStream: mocks.getObservationStream,
}));

vi.mock("../features/batchAction/processAddObservationsToDataset", () => ({
  processAddObservationsToDataset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../features/batchAction/processBatchedObservationEval", () => ({
  processBatchedObservationEval: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@langfuse/shared/src/db";
import type { BatchActionProcessingEventType } from "@langfuse/shared/src/server";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";

const rawCommentFilter: FilterCondition[] = [
  {
    type: "string",
    column: "commentContent",
    operator: "contains",
    value: "review me",
  },
];
const idFilter = (value: string[]): FilterCondition[] => [
  {
    type: "stringOptions",
    column: "id",
    operator: "any of",
    value,
  },
];
const resolvedCommentFilter = idFilter(["observation-1"]);
const emptySelectionFilter = idFilter([]);
const datasetConfig = {
  datasetId: "dataset-1",
  datasetName: "Dataset",
  mapping: {
    input: { mode: "full" },
    expectedOutput: { mode: "full" },
    metadata: { mode: "none" },
  },
} as const;

const runBatchAction = (payload: BatchActionProcessingEventType) =>
  handleBatchActionJob({ payload } as never);
const createPayload = (
  actionId: BatchActionProcessingEventType["actionId"],
  tableName = BatchTableNames.Events,
) =>
  ({
    projectId: "project-1",
    actionId,
    tableName,
    cutoffCreatedAt: new Date(),
    query: { filter: rawCommentFilter, orderBy: null },
    targetId: "queue-1",
    batchActionId: "batch-action-1",
    config: datasetConfig,
    evaluatorIds: ["evaluator-1"],
    type: BatchActionType.Create,
  }) as BatchActionProcessingEventType;

describe("event batch-action comment filter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: resolvedCommentFilter,
      hasNoMatches: false,
      matchingIds: ["observation-1"],
    });
    mocks.findEvaluators.mockResolvedValue([
      {
        evalTemplate: { type: "LLM_AS_JUDGE" },
      },
    ]);
  });

  it.each([
    {
      name: "Events annotation queue",
      payload: createPayload("observation-add-to-annotation-queue"),
      getStream: mocks.getEventsStreamForAnnotationQueue,
    },
    {
      name: "legacy Observations annotation queue",
      payload: createPayload(
        "observation-add-to-annotation-queue",
        BatchTableNames.Observations,
      ),
      getStream: mocks.getObservationStream,
    },
    {
      name: "legacy Observations dataset",
      payload: createPayload(
        "observation-add-to-dataset",
        BatchTableNames.Observations,
      ),
      getStream: mocks.getObservationStream,
    },
    {
      name: "Events evaluation",
      payload: createPayload("observation-run-batched-evaluation"),
      getStream: mocks.getEventsStreamForEval,
    },
    {
      name: "Events dataset with no matches",
      payload: createPayload("observation-add-to-dataset"),
      getStream: mocks.getEventsStreamForDataset,
      noMatches: true,
    },
  ])(
    "resolves observation comments for $name",
    async ({ payload, getStream, noMatches }) => {
      if (noMatches) {
        mocks.applyCommentFilters.mockResolvedValue({
          filterState: [],
          hasNoMatches: true,
          matchingIds: [],
        });
      }

      await runBatchAction(payload);

      expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
        filterState: rawCommentFilter,
        prisma,
        projectId: "project-1",
        objectType: "OBSERVATION",
      });
      expect(getStream).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: noMatches ? emptySelectionFilter : resolvedCommentFilter,
        }),
      );
    },
  );
});
