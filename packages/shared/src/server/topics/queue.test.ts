import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TopicsQueue,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
} from "./queue";
import {
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  TopicsEmbeddingQueue,
  enqueueTopicEmbeddingBatch,
} from "./embedding-queue";

vi.mock("../redis/redis", () => ({
  createBullMQQueueOptionsWithRedis: () => null,
  redis: null,
}));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./config", () => ({ isTopicsEnabled: () => true }));

afterEach(() => vi.restoreAllMocks());

describe("Topics execution queue state", () => {
  it("retries a terminal job atomically without replacing another caller's live job", async () => {
    let state = "failed";
    const retry = vi.fn(async () => {
      if (state !== "failed") throw new Error("Job no longer failed");
      state = "active";
    });
    const remove = vi.fn();
    const add = vi.fn();
    const job = {
      data: { payload: { projectId: "project-a", executionId: "run" } },
      getState: vi.fn(async () => state),
      retry,
      remove,
    };
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => job),
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);

    await Promise.all([
      enqueueTopicExecution("project-a", "run"),
      enqueueTopicExecution("project-a", "run"),
    ]);
    expect(retry).toHaveBeenCalledWith("failed");
    expect(state).toBe("active");
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("never resumes a job belonging to another project", async () => {
    const retry = vi.fn();
    const remove = vi.fn();
    const add = vi.fn();
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => ({
        data: { payload: { projectId: "other-project", executionId: "run" } },
        getState: vi.fn(async () => "failed"),
        retry,
        remove,
      })),
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    await expect(enqueueTopicExecution("project-a", "run")).rejects.toThrow(
      "scope",
    );
    expect(retry).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("distinguishes a live job, a terminal job, and missing or foreign jobs", async () => {
    const getState = vi.fn().mockResolvedValue("active");
    const getJob = vi.fn().mockResolvedValue({
      data: { payload: { projectId: "project-a", executionId: "run" } },
      getState,
    });
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);

    await expect(getTopicExecutionQueueState("project-a", "run")).resolves.toBe(
      "active",
    );
    getState.mockResolvedValue("failed");
    await expect(getTopicExecutionQueueState("project-a", "run")).resolves.toBe(
      "failed",
    );
    await expect(getTopicExecutionQueueState("project-b", "run")).resolves.toBe(
      "missing",
    );
    expect(getState).toHaveBeenCalledTimes(2);
    getJob.mockResolvedValue(undefined);
    await expect(getTopicExecutionQueueState("project-a", "run")).resolves.toBe(
      "missing",
    );
  });

  it("does not mistake an unavailable queue for an interrupted execution", async () => {
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue(null);
    await expect(
      getTopicExecutionQueueState("project-a", "run"),
    ).rejects.toThrow("Redis");
  });
});

describe("Topics embedding queue handoff", () => {
  const batch = {
    projectId: "project-a",
    executionId: "run",
    batchId: "batch-1",
    summaries: [
      { summaryId: "summary", facetVersionId: "facet", traceId: "trace" },
    ],
  };

  it("only retries failed batches on explicit resume and preserves expiry errors", async () => {
    const getState = vi.fn().mockResolvedValue("failed");
    const retry = vi.fn();
    vi.spyOn(TopicsEmbeddingQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => ({
        data: { payload: batch },
        failedReason: TOPIC_EMBEDDING_EXPIRED_ERROR,
        getState,
        retry,
      })),
    } as unknown as NonNullable<
      ReturnType<typeof TopicsEmbeddingQueue.getInstance>
    >);

    await expect(enqueueTopicEmbeddingBatch(batch)).rejects.toThrow(
      TOPIC_EMBEDDING_EXPIRED_ERROR,
    );
    expect(retry).not.toHaveBeenCalled();
    await expect(
      enqueueTopicEmbeddingBatch(batch, { retryFailed: true }),
    ).resolves.toBe("pending");
    expect(retry).toHaveBeenCalledOnce();
    expect(retry).toHaveBeenCalledWith("failed", {
      resetAttemptsMade: true,
    });
    getState.mockResolvedValue("completed");
    await expect(enqueueTopicEmbeddingBatch(batch)).resolves.toBe("complete");
    expect(retry).toHaveBeenCalledOnce();
  });

  it("rejects reuse of a batch ID with different accepted summaries", async () => {
    const retry = vi.fn();
    vi.spyOn(TopicsEmbeddingQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => ({
        data: { payload: batch },
        retry,
      })),
    } as unknown as NonNullable<
      ReturnType<typeof TopicsEmbeddingQueue.getInstance>
    >);
    await expect(
      enqueueTopicEmbeddingBatch({
        ...batch,
        summaries: [{ ...batch.summaries[0]!, summaryId: "different" }],
      }),
    ).rejects.toThrow("scope mismatch");
    expect(retry).not.toHaveBeenCalled();
  });
});
