import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  topicEmbeddingConfigSchema,
  topicExecutionInputSchema,
  type TopicExecutionSummary,
} from "../../topics";
import {
  TopicsUpdateQueue,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
} from "./queue";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
}));
vi.mock("./execution-store", () => ({
  readTopicExecutionSummary: mocks.read,
}));
vi.mock("../redis/redis", () => ({
  createBullMQQueueOptionsWithRedis: () => null,
}));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./config", () => ({ isTopicsEnabled: () => true }));

const execution = (
  operation: "process" | "update" = "update",
  count = 1,
): TopicExecutionSummary => ({
  id: "run",
  projectId: "project-a",
  input:
    operation === "process"
      ? {
          operation,
          projectId: "project-a",
          requestId: "request",
          facets: [{ facetId: "facet", version: 1 }],
          embeddingConfig: topicEmbeddingConfigSchema.parse({}),
        }
      : topicExecutionInputSchema.parse({
          projectId: "project-a",
          requestId: "request",
          facets: [{ facetId: "facet", version: 1 }],
          operation,
          timeRange: {
            from: new Date("2026-09-01T00:00:00.000Z"),
            to: new Date("2026-10-01T00:00:00.000Z"),
          },
        }),
  status: "queued",
  phase: "queued",
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  error: null,
  facets: [
    {
      facetId: "facet",
      facetVersion: 1,
      outcome: "pending",
      runId: null,
      error: null,
      counts: {
        requested: count,
        complete: 0,
        nonApplicable: 0,
        insufficientInput: 0,
        failed: 0,
        assigned: 0,
        outlier: 0,
      },
    },
  ],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.read.mockResolvedValue(execution());
});
afterEach(() => vi.restoreAllMocks());

const mockUpdateQueue = (queue: object) =>
  vi
    .spyOn(TopicsUpdateQueue, "getInstance")
    .mockReturnValue(
      queue as unknown as NonNullable<
        ReturnType<typeof TopicsUpdateQueue.getInstance>
      >,
    );

describe("Topics execution queue state", () => {
  it("resumes an update's failed facet even when BullMQ completed the job", async () => {
    const input = execution();
    input.status = "completed_with_errors";
    input.facets[0].outcome = "failed";
    mocks.read.mockResolvedValue(input);
    const retry = vi.fn();
    const add = vi.fn();
    vi.spyOn(TopicsUpdateQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => ({
        data: { payload: { projectId: "project-a", executionId: "run" } },
        getState: vi.fn(async () => "completed"),
        retry,
      })),
      add,
    } as unknown as NonNullable<
      ReturnType<typeof TopicsUpdateQueue.getInstance>
    >);
    await enqueueTopicExecution("project-a", "run");
    expect(retry).toHaveBeenCalledExactlyOnceWith("completed");
    expect(add).not.toHaveBeenCalled();
  });

  it("never resumes a retained job belonging to another project", async () => {
    const retry = vi.fn();
    const add = vi.fn();
    mockUpdateQueue({
      getJob: vi.fn(async () => ({
        data: { payload: { projectId: "other-project", executionId: "run" } },
        getState: vi.fn(async () => "failed"),
        retry,
      })),
      add,
    });
    await expect(enqueueTopicExecution("project-a", "run")).rejects.toThrow(
      "scope",
    );
    expect(retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("refuses to start or resume a legacy manual process run", async () => {
    mocks.read.mockResolvedValue(execution("process"));
    const add = vi.fn();
    mockUpdateQueue({ getJob: vi.fn(), add });
    await expect(enqueueTopicExecution("project-a", "run")).rejects.toThrow(
      "no longer",
    );
    expect(add).not.toHaveBeenCalled();
  });

  it("reads an update's job state and validates job scope", async () => {
    const getJob = vi.fn().mockResolvedValue({
      data: { payload: { projectId: "project-a", executionId: "run" } },
      getState: vi.fn(async () => "active"),
    });
    mockUpdateQueue({ getJob });
    await expect(getTopicExecutionQueueState(execution())).resolves.toBe(
      "active",
    );
    expect(getJob).toHaveBeenCalledExactlyOnceWith("run");
    await expect(
      getTopicExecutionQueueState({ ...execution(), projectId: "project-b" }),
    ).resolves.toBe("missing");
    getJob.mockClear();
    await expect(
      getTopicExecutionQueueState({
        ...execution("process"),
        status: "running",
      }),
    ).resolves.toBe("missing");
    expect(getJob).not.toHaveBeenCalled();
    vi.spyOn(TopicsUpdateQueue, "getInstance").mockReturnValue(null);
    await expect(getTopicExecutionQueueState(execution())).rejects.toThrow(
      "Redis",
    );
  });
});
