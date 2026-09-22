import { beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedError, UnrecoverableError } from "bullmq";

import {
  topicExecutionInputSchema,
  type TopicProcessBatchState,
} from "@langfuse/shared/topics";

const mocks = vi.hoisted(() => ({
  state: vi.fn(),
  process: vi.fn(),
  progress: vi.fn(),
  enabled: vi.fn(),
  embed: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", () => ({
  QueueJobs: { Topics: "topics", TopicsEmbedding: "topics-embedding" },
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicEmbeddingBatchState: mocks.state,
  recordTopicProcessBatchProgress: mocks.progress,
  isTopicsProjectEnabled: mocks.enabled,
}));
vi.mock("../features/topics/processTopicsExecution", () => ({
  processTopicsExecution: mocks.process,
}));
vi.mock("../features/topics/processTopicEmbeddingBatch", () => ({
  processTopicEmbeddingBatch: mocks.embed,
}));

import { topicsQueueProcessor } from "./topicsQueue";
import { topicsEmbeddingQueueProcessor } from "./topicsEmbeddingQueue";

function waitingJob() {
  const data: Parameters<typeof topicsQueueProcessor>[0]["data"] = {
    id: "execution",
    name: "topics",
    timestamp: new Date(),
    payload: {
      projectId: "project",
      executionId: "execution",
      batchId: "0",
      traceIds: ["trace"],
    },
    pendingEmbeddingBatchIds: ["batch-a", "batch-b"],
  };
  return {
    name: "topics",
    data,
    token: "lock-token",
    moveToDelayed: vi.fn().mockResolvedValue(undefined),
    updateData: vi.fn(async (updated: typeof data) =>
      Object.assign(data, updated),
    ),
  };
}

function acceptedState(): TopicProcessBatchState {
  return {
    execution: {
      id: "execution",
      projectId: "project",
      revision: "1",
      input: topicExecutionInputSchema.parse({
        operation: "process",
        projectId: "project",
        requestId: "request",
        facetVersionIds: ["facet"],
        traceIds: ["trace"],
      }),
      status: "running",
      phase: "embedding",
      createdAt: "2026-09-16T00:00:00.000Z",
      updatedAt: "2026-09-16T00:00:00.000Z",
      error: null,
      traceErrors: [],
      facets: [
        {
          facetVersionId: "facet",
          outcome: "pending",
          runId: null,
          summaryIds: ["summary"],
          error: null,
          counts: {
            requested: 1,
            complete: 0,
            nonApplicable: 0,
            insufficientInput: 0,
            failed: 0,
            assigned: 0,
            outlier: 0,
          },
        },
      ],
    },
    summaries: [
      { summaryId: "summary", facetVersionId: "facet", traceId: "trace" },
    ],
    failedTraceIds: {},
    summarized: true,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.enabled.mockReturnValue(true);
  mocks.state.mockResolvedValue("pending");
});

describe("Topics project allowlist", () => {
  it("rejects processing and update jobs before polling or processing", async () => {
    mocks.enabled.mockReturnValue(false);
    const job = waitingJob();
    await expect(
      topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      ),
    ).rejects.toBeInstanceOf(UnrecoverableError);
    expect(mocks.enabled).toHaveBeenCalledWith("project");
    expect(mocks.state).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
    expect(mocks.progress).not.toHaveBeenCalled();
    expect(job.updateData).not.toHaveBeenCalled();
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    "runs embedding only when allowed: %s",
    async (allowed) => {
      mocks.enabled.mockReturnValue(allowed);
      const payload = {
        projectId: "project",
        executionId: "execution",
        batchId: "batch",
        summaries: [],
      };
      const result = topicsEmbeddingQueueProcessor({
        name: "topics-embedding",
        data: { payload },
      } as unknown as Parameters<typeof topicsEmbeddingQueueProcessor>[0]);
      if (allowed) {
        await result;
        expect(mocks.embed).toHaveBeenCalledExactlyOnceWith(payload);
      } else {
        await expect(result).rejects.toBeInstanceOf(UnrecoverableError);
        expect(mocks.embed).not.toHaveBeenCalled();
      }
      expect(mocks.enabled).toHaveBeenCalledWith("project");
    },
  );
});

describe("Topics coordinator waiting", () => {
  it("keeps unchanged polls out of the coordinator and retains unfinished batches", async () => {
    const job = waitingJob();
    const run = () =>
      topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      );
    await expect(run()).rejects.toBeInstanceOf(DelayedError);
    expect(mocks.process).not.toHaveBeenCalled();
    expect(job.updateData).not.toHaveBeenCalled();
    expect(job.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      "lock-token",
    );

    mocks.state.mockImplementation(async (_scope, id) =>
      id === "batch-a" ? "complete" : "pending",
    );
    await expect(run()).rejects.toBeInstanceOf(DelayedError);
    expect(job.data.pendingEmbeddingBatchIds).toEqual(["batch-b"]);
    expect(mocks.process).not.toHaveBeenCalled();

    mocks.state.mockResolvedValue("complete");
    await run();
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        ...job.data.payload,
        saveBatchState: expect.any(Function),
      }),
    );
    expect(job.data.pendingEmbeddingBatchIds).toEqual([]);
  });

  it.each(["failed", "missing"])(
    "returns a %s batch to the coordinator for recovery",
    async (state) => {
      const job = waitingJob();
      mocks.state.mockResolvedValue(state);
      await topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      );
      expect(mocks.process).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          ...job.data.payload,
          saveBatchState: expect.any(Function),
        }),
      );
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    },
  );
  it("persists accepted summary references before delaying and restores them after embedding", async () => {
    const job = waitingJob();
    job.data.pendingEmbeddingBatchIds = [];
    const accepted = acceptedState();
    mocks.process.mockImplementationOnce(async ({ saveBatchState }) => {
      await saveBatchState(accepted);
      expect(mocks.progress).toHaveBeenCalledWith("0", accepted);
      return { pendingEmbeddingBatchIds: ["embedding-batch"] };
    });
    const run = () =>
      topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      );
    await expect(run()).rejects.toBeInstanceOf(DelayedError);
    expect(job.data.batchState).toBe(accepted);
    expect(job.data.pendingEmbeddingBatchIds).toEqual(["embedding-batch"]);
    expect(mocks.progress).toHaveBeenLastCalledWith("0", accepted);
    const progressCalls = mocks.progress.mock.calls.length;
    await expect(run()).rejects.toBeInstanceOf(DelayedError);
    expect(mocks.process).toHaveBeenCalledOnce();
    expect(mocks.progress).toHaveBeenCalledTimes(progressCalls);

    mocks.state.mockResolvedValue("complete");
    mocks.process.mockImplementationOnce(
      async ({ batchState, saveBatchState }) => {
        expect(batchState).toBe(accepted);
        await saveBatchState({
          ...batchState,
          execution: { ...batchState.execution, status: "completed" },
        });
      },
    );
    await run();
    expect(job.data.batchState?.summaries).toEqual(accepted.summaries);
    expect(mocks.progress).toHaveBeenLastCalledWith(
      "0",
      expect.objectContaining({
        execution: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("retains accepted work and records progress when processing throws", async () => {
    const job = waitingJob();
    job.data.pendingEmbeddingBatchIds = [];
    const accepted = acceptedState();
    mocks.process.mockImplementationOnce(async ({ saveBatchState }) => {
      await saveBatchState(accepted);
      mocks.progress.mockClear();
      throw new Error("provider unavailable");
    });
    await expect(
      topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      ),
    ).rejects.toThrow("provider unavailable");
    expect(job.data.batchState).toBe(accepted);
    expect(mocks.progress).toHaveBeenCalledExactlyOnceWith("0", accepted);
    expect(job.moveToDelayed).not.toHaveBeenCalled();
  });

  it("keeps a reported failed facet retryable in BullMQ", async () => {
    const job = waitingJob();
    job.data.pendingEmbeddingBatchIds = [];
    const failed = acceptedState();
    failed.execution.status = "completed_with_errors";
    failed.execution.facets[0].outcome = "failed";
    mocks.process.mockImplementationOnce(async ({ saveBatchState }) => {
      await saveBatchState(failed);
    });
    await expect(
      topicsQueueProcessor(
        job as unknown as Parameters<typeof topicsQueueProcessor>[0],
      ),
    ).rejects.toThrow("Resume to retry");
    expect(mocks.progress).toHaveBeenLastCalledWith("0", failed);
    expect(job.data.batchState).toBe(failed);
  });
});
