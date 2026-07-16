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

vi.mock("../features/database-read-stream/getDatabaseReadStream", () => ({
  getDatabaseReadStreamPaginated: vi.fn(),
  getTraceIdentifierStream: vi.fn(),
}));

vi.mock("../features/database-read-stream/event-stream", () => ({
  getEventsStreamForAnnotationQueue: mocks.getEventsStreamForAnnotationQueue,
  getEventsStreamForDataset: mocks.getEventsStreamForDataset,
}));

vi.mock("../features/database-read-stream/observation-stream", () => ({
  getObservationStream: mocks.getObservationStream,
}));

vi.mock("../features/batchAction/processAddToQueue", () => ({
  processAddObservationsToQueue: vi.fn(),
  processAddSessionsToQueue: vi.fn(),
  processAddTracesToQueue: vi.fn(),
}));

vi.mock("../features/batchAction/processAddObservationsToDataset", () => ({
  processAddObservationsToDataset: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../features/batchAction/processBatchedObservationEval", () => ({
  processBatchedObservationEval: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../features/scores/processClickhouseScoreDelete", () => ({
  processClickhouseScoreDelete: vi.fn(),
}));

vi.mock("../features/batchAction/processDeleteDatasets", () => ({
  processDeleteDatasets: vi.fn(),
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
const resolvedCommentFilter: FilterCondition[] = [
  {
    type: "stringOptions",
    column: "id",
    operator: "any of",
    value: ["observation-1"],
  },
];
const createQuery = () => ({
  filter: rawCommentFilter.map((filter) => ({ ...filter })),
  orderBy: null,
});
const datasetConfig = {
  datasetId: "dataset-1",
  datasetName: "Dataset",
  mapping: {
    input: { mode: "full" },
    expectedOutput: { mode: "full" },
    metadata: { mode: "none" },
  },
} as const;

const resolveComments = () =>
  mocks.applyCommentFilters.mockResolvedValue({
    filterState: resolvedCommentFilter,
    hasNoMatches: false,
    matchingIds: ["observation-1"],
  });
const runBatchAction = (payload: BatchActionProcessingEventType) =>
  handleBatchActionJob({ payload } as never);

describe("event batch-action comment filter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findEvaluators.mockReset();
    mocks.applyCommentFilters.mockImplementation(
      async ({ filterState }: { filterState: FilterCondition[] }) => ({
        filterState,
        hasNoMatches: false,
        matchingIds: null,
      }),
    );
  });

  it("resolves observation comments before streaming Events into an annotation queue", async () => {
    resolveComments();

    await runBatchAction({
      projectId: "project-1",
      actionId: "observation-add-to-annotation-queue",
      tableName: BatchTableNames.Events,
      cutoffCreatedAt: new Date(),
      targetId: "queue-1",
      query: createQuery(),
      type: BatchActionType.Create,
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: rawCommentFilter,
      prisma,
      projectId: "project-1",
      objectType: "OBSERVATION",
    });
    expect(mocks.getEventsStreamForAnnotationQueue).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedCommentFilter }),
    );
  });

  it("turns a no-match Events comment filter into an empty dataset selection", async () => {
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [],
      hasNoMatches: true,
      matchingIds: [],
    });

    await runBatchAction({
      projectId: "project-1",
      actionId: "observation-add-to-dataset",
      tableName: BatchTableNames.Events,
      cutoffCreatedAt: new Date(),
      batchActionId: "batch-action-1",
      query: createQuery(),
      config: datasetConfig,
      type: BatchActionType.Create,
    });

    expect(mocks.getEventsStreamForDataset).toHaveBeenCalledWith(
      expect.objectContaining({
        filter: [
          {
            type: "stringOptions",
            column: "id",
            operator: "any of",
            value: [],
          },
        ],
      }),
    );
  });

  it("resolves observation comments before streaming legacy Observations into a dataset", async () => {
    resolveComments();

    await runBatchAction({
      projectId: "project-1",
      actionId: "observation-add-to-dataset",
      tableName: BatchTableNames.Observations,
      cutoffCreatedAt: new Date(),
      batchActionId: "batch-action-legacy",
      query: createQuery(),
      config: datasetConfig,
      type: BatchActionType.Create,
    });

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: rawCommentFilter,
      prisma,
      projectId: "project-1",
      objectType: "OBSERVATION",
    });
    expect(mocks.getObservationStream).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedCommentFilter }),
    );
  });

  it("resolves observation comments before streaming Events for a batched evaluation", async () => {
    resolveComments();
    mocks.findEvaluators.mockResolvedValue([
      {
        evalTemplate: { type: "LLM_AS_JUDGE" },
      },
    ]);

    await runBatchAction({
      projectId: "project-1",
      actionId: "observation-run-batched-evaluation",
      cutoffCreatedAt: new Date(),
      batchActionId: "batch-action-2",
      evaluatorIds: ["evaluator-1"],
      query: createQuery(),
    });

    expect(mocks.getEventsStreamForEval).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedCommentFilter }),
    );
  });
});
