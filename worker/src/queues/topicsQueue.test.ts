import { beforeEach, describe, expect, it, vi } from "vitest";
import { DelayedError } from "bullmq";

const mocks = vi.hoisted(() => ({ state: vi.fn(), process: vi.fn() }));
vi.mock("@langfuse/shared/src/server", () => ({
  QueueJobs: { Topics: "topics" },
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicEmbeddingBatchState: mocks.state,
}));
vi.mock("../features/topics/processTopicsExecution", () => ({
  processTopicsExecution: mocks.process,
}));

import { topicsQueueProcessor } from "./topicsQueue";

function waitingJob() {
  const data = {
    id: "execution",
    name: "topics",
    timestamp: new Date(),
    payload: { projectId: "project", executionId: "execution" },
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.state.mockResolvedValue("pending");
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
    expect(mocks.process).toHaveBeenCalledExactlyOnceWith(job.data.payload);
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
      expect(mocks.process).toHaveBeenCalledExactlyOnceWith(job.data.payload);
      expect(job.moveToDelayed).not.toHaveBeenCalled();
    },
  );
});
