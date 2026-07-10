import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BatchActionType,
  BatchTableNames,
  EvalTargetObject,
  EvalTemplateType,
  JobConfigState,
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
    getTraceIdentifierStream: vi.fn(emptyStream),
    processAddObservationsToDataset: vi.fn().mockResolvedValue(undefined),
    processBatchedObservationEval: vi.fn().mockResolvedValue(undefined),
    findEvaluators: vi.fn(),
    updateBatchAction: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    jobConfiguration: {
      findMany: mocks.findEvaluators,
    },
    batchAction: {
      update: mocks.updateBatchAction,
    },
  },
}));

vi.mock("@langfuse/shared/src/server", () => ({
  applyCommentFilters: mocks.applyCommentFilters,
  getEventsStreamForEval: mocks.getEventsStreamForEval,
  getCurrentSpan: vi.fn(() => undefined),
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
  CreateEvalQueue: { getInstance: vi.fn() },
  findDatasetIdsForBatchDeletion: vi.fn(),
  traceDeletionProcessor: vi.fn(),
}));

vi.mock("../features/database-read-stream/getDatabaseReadStream", () => ({
  getDatabaseReadStreamPaginated: vi.fn(),
  getTraceIdentifierStream: mocks.getTraceIdentifierStream,
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
  processAddObservationsToDataset: mocks.processAddObservationsToDataset,
}));

vi.mock("../features/batchAction/processBatchedObservationEval", () => ({
  processBatchedObservationEval: mocks.processBatchedObservationEval,
}));

vi.mock("../features/scores/processClickhouseScoreDelete", () => ({
  processClickhouseScoreDelete: vi.fn(),
}));

vi.mock("../features/batchAction/processDeleteDatasets", () => ({
  processDeleteDatasets: vi.fn(),
}));

import { prisma } from "@langfuse/shared/src/db";
import { handleBatchActionJob } from "../features/batchAction/handleBatchActionJob";

const datasetConfig = {
  datasetId: "dataset-1",
  datasetName: "Dataset",
  mapping: {
    input: { mode: "full" },
    expectedOutput: { mode: "full" },
    metadata: { mode: "none" },
  },
} as const;

describe("event batch-action comment filter wiring", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyCommentFilters.mockImplementation(
      async ({ filterState }: { filterState: unknown[] }) => ({
        filterState,
        hasNoMatches: false,
        matchingIds: null,
      }),
    );
  });

  it("resolves observation comments before streaming Events into an annotation queue", async () => {
    const rawFilter = [
      {
        type: "string" as const,
        column: "commentContent",
        operator: "contains" as const,
        value: "review me",
      },
    ];
    const query = { filter: rawFilter, orderBy: null };
    const originalQuery = structuredClone(query);
    const resolvedFilter = [
      {
        type: "stringOptions" as const,
        column: "id",
        operator: "any of" as const,
        value: ["observation-1"],
      },
    ];
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: resolvedFilter,
      hasNoMatches: false,
      matchingIds: ["observation-1"],
    });

    await handleBatchActionJob({
      payload: {
        projectId: "project-1",
        actionId: "observation-add-to-annotation-queue",
        tableName: BatchTableNames.Events,
        cutoffCreatedAt: new Date(),
        targetId: "queue-1",
        query,
        type: BatchActionType.Create,
      },
    } as never);

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: rawFilter,
      prisma,
      projectId: "project-1",
      objectType: "OBSERVATION",
    });
    expect(mocks.getEventsStreamForAnnotationQueue).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedFilter }),
    );
    expect(query).toEqual(originalQuery);
  });

  it("turns a no-match Events comment filter into an explicit empty dataset selection", async () => {
    const query = {
      filter: [
        {
          type: "number" as const,
          column: "commentCount",
          operator: ">" as const,
          value: 0,
        },
      ],
      orderBy: null,
    };
    const originalQuery = structuredClone(query);
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: [],
      hasNoMatches: true,
      matchingIds: [],
    });

    await handleBatchActionJob({
      payload: {
        projectId: "project-1",
        actionId: "observation-add-to-dataset",
        tableName: BatchTableNames.Events,
        cutoffCreatedAt: new Date(),
        batchActionId: "batch-action-1",
        query,
        config: datasetConfig,
        type: BatchActionType.Create,
      },
    } as never);

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
    expect(query).toEqual(originalQuery);
  });

  it("resolves observation comments before streaming legacy Observations into a dataset", async () => {
    const rawFilter = [
      {
        type: "string" as const,
        column: "commentContent",
        operator: "contains" as const,
        value: "legacy observation",
      },
    ];
    const resolvedFilter = [
      {
        type: "stringOptions" as const,
        column: "id",
        operator: "any of" as const,
        value: ["observation-legacy"],
      },
    ];
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: resolvedFilter,
      hasNoMatches: false,
      matchingIds: ["observation-legacy"],
    });

    await handleBatchActionJob({
      payload: {
        projectId: "project-1",
        actionId: "observation-add-to-dataset",
        tableName: BatchTableNames.Observations,
        cutoffCreatedAt: new Date(),
        batchActionId: "batch-action-legacy",
        query: { filter: rawFilter, orderBy: null },
        config: datasetConfig,
        type: BatchActionType.Create,
      },
    } as never);

    expect(mocks.applyCommentFilters).toHaveBeenCalledWith({
      filterState: rawFilter,
      prisma,
      projectId: "project-1",
      objectType: "OBSERVATION",
    });
    expect(mocks.getObservationStream).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedFilter }),
    );
  });

  it("resolves observation comments before streaming Events for a batched evaluation", async () => {
    const rawFilter = [
      {
        type: "string" as const,
        column: "commentContent",
        operator: "contains" as const,
        value: "evaluate",
      },
    ];
    const query = { filter: rawFilter, orderBy: null };
    const originalQuery = structuredClone(query);
    const resolvedFilter = [
      {
        type: "stringOptions" as const,
        column: "id",
        operator: "any of" as const,
        value: ["observation-2"],
      },
    ];
    mocks.applyCommentFilters.mockResolvedValue({
      filterState: resolvedFilter,
      hasNoMatches: false,
      matchingIds: ["observation-2"],
    });
    mocks.findEvaluators.mockResolvedValue([
      {
        id: "evaluator-1",
        projectId: "project-1",
        evalTemplateId: "template-1",
        evalTemplate: { type: EvalTemplateType.LLM_AS_JUDGE },
        scoreName: "quality",
        targetObject: EvalTargetObject.EVENT,
        variableMapping: [],
        status: JobConfigState.ACTIVE,
        blockedAt: null,
      },
    ]);

    await handleBatchActionJob({
      payload: {
        projectId: "project-1",
        actionId: "observation-run-batched-evaluation",
        cutoffCreatedAt: new Date(),
        batchActionId: "batch-action-2",
        evaluatorIds: ["evaluator-1"],
        query,
      },
    } as never);

    expect(mocks.getEventsStreamForEval).toHaveBeenCalledWith(
      expect.objectContaining({ filter: resolvedFilter }),
    );
    expect(mocks.processBatchedObservationEval).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        batchActionId: "batch-action-2",
      }),
    );
    expect(query).toEqual(originalQuery);
  });

  it("does not alter the legacy trace-delete path", async () => {
    const rawFilter = [
      {
        type: "string" as const,
        column: "commentContent",
        operator: "contains" as const,
        value: "leave untouched",
      },
    ];

    await handleBatchActionJob({
      payload: {
        projectId: "project-1",
        actionId: "trace-delete",
        tableName: BatchTableNames.Events,
        cutoffCreatedAt: new Date(),
        query: { filter: rawFilter, orderBy: null },
        type: BatchActionType.Delete,
      },
    } as never);

    expect(mocks.applyCommentFilters).not.toHaveBeenCalled();
    expect(mocks.getTraceIdentifierStream).toHaveBeenCalledWith(
      expect.objectContaining({ filter: rawFilter }),
    );
  });
});
