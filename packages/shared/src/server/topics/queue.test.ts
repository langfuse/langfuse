import { afterEach, describe, expect, it, vi } from "vitest";
import {
  TopicsQueue,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
} from "./queue";

vi.mock("../redis/redis", () => ({
  createBullMQQueueOptionsWithRedis: () => null,
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
