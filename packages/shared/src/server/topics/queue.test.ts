import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Redis from "ioredis";
import { env } from "../../env";
import {
  topicExecutionInputSchema,
  type TopicExecution,
  type TopicProcessBatchState,
  type TopicSummary,
} from "../../topics";
import {
  TopicsQueue,
  TopicsUpdateQueue,
  enqueueTopicExecution,
  getTopicExecutionQueueState,
  recordTopicProcessBatchProgress,
} from "./queue";
import {
  TOPIC_EMBEDDING_EXPIRED_ERROR,
  TopicsEmbeddingQueue,
  enqueueTopicEmbeddingBatch,
  readStagedTopicSummary,
  updateStagedTopicSummary,
} from "./embedding-queue";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  write: vi.fn(),
  eval: vi.fn(),
  hget: vi.fn(),
  exists: vi.fn(),
  get: vi.fn(),
}));
vi.mock("./journal", () => ({
  readTopicExecutionSummary: mocks.read,
  writeTopicExecution: mocks.write,
}));
vi.mock("../redis/redis", () => ({
  createBullMQQueueOptionsWithRedis: () => null,
  redis: {
    eval: mocks.eval,
    hget: mocks.hget,
    exists: mocks.exists,
    get: mocks.get,
  },
}));
vi.mock("../logger", () => ({ logger: { error: vi.fn() } }));
vi.mock("./config", () => ({ isTopicsEnabled: () => true }));

const execution = (
  operation: "process" | "update" = "process",
  count = 1,
): TopicExecution => ({
  id: "run",
  projectId: "project-a",
  input: topicExecutionInputSchema.parse({
    projectId: "project-a",
    requestId: "request",
    facets: [{ facetId: "facet", version: 1 }],
    operation,
    ...(operation === "process"
      ? { traceIds: Array.from({ length: count }, (_, i) => `trace-${i}`) }
      : {}),
  }),
  status: "queued",
  phase: "queued",
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  error: null,
  traceErrors: [],
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
  mocks.hget.mockResolvedValue(null);
  mocks.exists.mockResolvedValue(2);
});
afterEach(() => vi.restoreAllMocks());

describe("Topics execution queue state", () => {
  it("splits the full selection into bounded jobs and isolates topic updates", async () => {
    const processing = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
    };
    const updating = {
      getJob: vi.fn().mockResolvedValue(undefined),
      add: vi.fn(),
    };
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue(
      processing as unknown as NonNullable<
        ReturnType<typeof TopicsQueue.getInstance>
      >,
    );
    vi.spyOn(TopicsUpdateQueue, "getInstance").mockReturnValue(
      updating as unknown as NonNullable<
        ReturnType<typeof TopicsUpdateQueue.getInstance>
      >,
    );
    const input = execution("process", 1005);
    const traceIds =
      input.input.operation === "process" ? input.input.traceIds : [];
    mocks.read.mockResolvedValue(input);
    await enqueueTopicExecution("project-a", "run", "process", traceIds);
    expect(processing.add).toHaveBeenCalledTimes(11);
    expect(
      processing.add.mock.calls.flatMap(([, job]) => job.payload.traceIds),
    ).toEqual(traceIds);
    expect(
      processing.add.mock.calls.every(
        ([, job]) => job.payload.traceIds.length <= 100,
      ),
    ).toBe(true);
    expect(
      processing.add.mock.calls.map(([, , options]) => options.jobId),
    ).toEqual(Array.from({ length: 11 }, (_, i) => `run-${i}`));

    mocks.read.mockResolvedValue(execution("update"));
    await enqueueTopicExecution("project-a", "run", "update");
    expect(updating.add).toHaveBeenCalledExactlyOnceWith(
      "topics",
      expect.objectContaining({
        payload: { projectId: "project-a", executionId: "run" },
      }),
      { jobId: "run" },
    );
  });

  it("retries terminal batches atomically without replacing their accepted input", async () => {
    let state = "failed";
    const retry = vi.fn(async () => {
      if (state !== "failed") throw new Error("Job no longer failed");
      state = "active";
    });
    const add = vi.fn();
    const payload = {
      projectId: "project-a",
      executionId: "run",
      batchId: "0",
      traceIds: ["original-trace"],
    };
    const job = {
      data: { payload },
      getState: vi.fn(async () => state),
      retry,
    };
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => job),
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    await Promise.all([
      enqueueTopicExecution("project-a", "run", "process"),
      enqueueTopicExecution("project-a", "run", "process"),
    ]);
    expect(retry).toHaveBeenCalledWith("failed");
    expect(state).toBe("active");
    expect(job.data.payload.traceIds).toEqual(["original-trace"]);
    expect(add).not.toHaveBeenCalled();
  });

  it("requires the original selection if any batch input has expired", async () => {
    const input = execution("process", 101);
    const traceIds =
      input.input.operation === "process" ? input.input.traceIds : [];
    mocks.read.mockResolvedValue(input);
    const add = vi.fn();
    const first = {
      data: {
        payload: {
          projectId: "project-a",
          executionId: "run",
          batchId: "0",
          traceIds: traceIds.slice(0, 100),
        },
      },
      getState: vi.fn(async () => "completed"),
      retry: vi.fn(),
    };
    const getJob = vi.fn(async (id: string) =>
      id === "run-0" ? first : undefined,
    );
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob,
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    await expect(
      enqueueTopicExecution("project-a", "run", "process"),
    ).rejects.toThrow("expired");
    expect(first.retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
    await expect(
      enqueueTopicExecution("project-a", "run", "process", [
        "changed-trace",
        ...traceIds.slice(1),
      ]),
    ).rejects.toThrow("selection changed");
    expect(add).not.toHaveBeenCalled();
    await enqueueTopicExecution("project-a", "run", "process", traceIds);
    expect(add).toHaveBeenCalledExactlyOnceWith(
      "topics",
      expect.objectContaining({
        payload: {
          projectId: "project-a",
          executionId: "run",
          batchId: "1",
          traceIds: ["trace-100"],
        },
      }),
      { jobId: "run-1" },
    );
  });

  it("skips evicted successful batches while retrying unfinished retained batches", async () => {
    mocks.read.mockResolvedValue(execution("process", 101));
    mocks.hget.mockResolvedValue(JSON.stringify({ finished: 1, failed: 0 }));
    const retry = vi.fn();
    const add = vi.fn();
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async (id: string) =>
        id === "run-1"
          ? {
              data: {
                payload: {
                  projectId: "project-a",
                  executionId: "run",
                  batchId: "1",
                  traceIds: ["trace-100"],
                },
              },
              getState: vi.fn(async () => "failed"),
              retry,
            }
          : undefined,
      ),
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    await enqueueTopicExecution("project-a", "run", "process");
    expect(retry).toHaveBeenCalledExactlyOnceWith("failed");
    expect(add).not.toHaveBeenCalled();
    mocks.hget.mockResolvedValue(JSON.stringify({ finished: 1, failed: 1 }));
    await expect(
      enqueueTopicExecution("project-a", "run", "process"),
    ).rejects.toThrow("expired");
  });

  it("resumes an update's failed facet even when BullMQ completed the job", async () => {
    const input = execution("update");
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
    await enqueueTopicExecution("project-a", "run", "update");
    expect(retry).toHaveBeenCalledExactlyOnceWith("completed");
    expect(add).not.toHaveBeenCalled();
  });

  it("never resumes a retained batch belonging to another project", async () => {
    const retry = vi.fn();
    const add = vi.fn();
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob: vi.fn(async () => ({
        data: { payload: { projectId: "other-project", executionId: "run" } },
        getState: vi.fn(async () => "failed"),
        retry,
      })),
      add,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    await expect(
      enqueueTopicExecution("project-a", "run", "process"),
    ).rejects.toThrow("scope");
    expect(retry).not.toHaveBeenCalled();
    expect(add).not.toHaveBeenCalled();
  });

  it("checks one pending batch for stalled progress and validates job scope", async () => {
    const getState = vi.fn(async () => "active");
    const getJob = vi.fn().mockResolvedValue({
      data: { payload: { projectId: "project-a", executionId: "run" } },
      getState,
    });
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue({
      getJob,
    } as unknown as NonNullable<ReturnType<typeof TopicsQueue.getInstance>>);
    vi.spyOn(TopicsUpdateQueue, "getInstance").mockReturnValue({
      getJob,
    } as unknown as NonNullable<
      ReturnType<typeof TopicsUpdateQueue.getInstance>
    >);
    const input = {
      ...execution("process", 200),
      status: "running" as const,
    };
    mocks.hget.mockResolvedValue("1");
    await expect(getTopicExecutionQueueState(input)).resolves.toBe("active");
    expect(getJob).toHaveBeenCalledExactlyOnceWith("run-1");
    getState.mockResolvedValue("failed");
    await expect(getTopicExecutionQueueState(input)).resolves.toBe("failed");
    mocks.hget.mockResolvedValue(null);
    getJob.mockClear();
    await expect(getTopicExecutionQueueState(input)).resolves.toBe("missing");
    await expect(
      getTopicExecutionQueueState({ ...input, status: "failed" }),
    ).resolves.toBe("failed");
    expect(getJob).not.toHaveBeenCalled();
    getState.mockResolvedValue("active");
    await expect(
      getTopicExecutionQueueState(execution("update")),
    ).resolves.toBe("active");
    await expect(
      getTopicExecutionQueueState({
        ...execution("update"),
        projectId: "project-b",
      }),
    ).resolves.toBe("missing");
    vi.spyOn(TopicsQueue, "getInstance").mockReturnValue(null);
    await expect(getTopicExecutionQueueState(input)).rejects.toThrow("Redis");
  });

  it("aggregates replayed and resumed batches once using Redis", async () => {
    const options = {
      lazyConnect: true,
      maxRetriesPerRequest: 0,
      connectTimeout: 2000,
    };
    const client = env.REDIS_CONNECTION_STRING
      ? new Redis(env.REDIS_CONNECTION_STRING, options)
      : new Redis({
          ...options,
          host: env.REDIS_HOST ?? "localhost",
          port: env.REDIS_PORT ?? 6379,
          password: env.REDIS_AUTH ?? undefined,
          username: env.REDIS_USERNAME ?? undefined,
        });
    const keys = new Set<string>();
    mocks.exists.mockImplementation((...keys: string[]) =>
      client.exists(...keys),
    );
    mocks.eval.mockImplementation(
      async (
        script: string,
        numberOfKeys: number,
        ...args: (string | number)[]
      ) => {
        args.slice(0, numberOfKeys).forEach((key) => keys.add(String(key)));
        return client.eval(script, numberOfKeys, ...args);
      },
    );
    const parent = { ...execution("process", 200), id: randomUUID() };
    parent.facets.push({
      ...structuredClone(parent.facets[0]),
      facetVersion: 2,
    });
    mocks.read.mockImplementation(async () => structuredClone(parent));
    mocks.write.mockImplementation(async (state: TopicExecution) => {
      Object.assign(parent, structuredClone(state));
    });
    const batch = (
      status: "failed" | "completed" | "running",
    ): TopicProcessBatchState => {
      const local = structuredClone(parent);
      local.status = status;
      local.facets[1].counts.requested = 100;
      local.facets[1].counts.complete = status === "completed" ? 50 : 0;
      local.facets[1].outcome = status === "completed" ? "assigned" : "pending";
      local.facets[0].counts.requested = 100;
      local.facets[0].counts.complete = status === "completed" ? 100 : 0;
      local.facets[0].outcome = {
        failed: "failed" as const,
        running: "pending" as const,
        completed: "awaiting_topics" as const,
      }[status];
      return {
        execution: local,
        summaries: [],
        failedTraceIds: [],
        summarized: true,
      };
    };
    try {
      await recordTopicProcessBatchProgress("0", batch("completed"));
      await recordTopicProcessBatchProgress("0", batch("completed"));
      expect(mocks.write.mock.lastCall?.[0]).toMatchObject({
        status: "running",
        facets: [
          { facetVersion: 1, counts: { requested: 200, complete: 100 } },
          { facetVersion: 2, counts: { requested: 200, complete: 50 } },
        ],
      });
      const totalsKey = [...keys].find((key) => key.endsWith(":totals"))!;
      expect(await client.hget(totalsKey, "next")).toBe("1");
      await recordTopicProcessBatchProgress("1", batch("failed"));
      expect(mocks.write.mock.lastCall?.[0].status).toBe("failed");
      await recordTopicProcessBatchProgress("1", batch("running"));
      expect(mocks.write.mock.lastCall?.[0].status).toBe("running");
      expect(await client.hget(totalsKey, "next")).toBe("1");
      await recordTopicProcessBatchProgress("1", batch("completed"));
      expect(mocks.write.mock.lastCall?.[0]).toMatchObject({
        status: "completed",
        facets: [
          {
            outcome: "awaiting_topics",
            counts: { requested: 200, complete: 200 },
          },
          {
            facetVersion: 2,
            outcome: "assigned",
            counts: { requested: 200, complete: 100 },
          },
        ],
      });
      expect(mocks.write.mock.calls.map(([, version]) => version)).toEqual([
        1, 2, 3, 4, 5,
      ]);
      for (const key of keys) expect(await client.ttl(key)).toBeGreaterThan(0);
      await client.del(...keys);
      mocks.write.mockClear();
      await expect(
        recordTopicProcessBatchProgress("1", batch("running")),
      ).rejects.toThrow("expired");
      expect(mocks.write).not.toHaveBeenCalled();
    } finally {
      if (keys.size) await client.del(...keys);
      client.disconnect();
    }
  });
});

describe("Topics embedding queue handoff", () => {
  const batch = {
    projectId: "project-a",
    executionId: "run",
    batchId: "batch-1",
    summaries: [
      {
        summaryId: "summary",
        facetId: "facet",
        facetVersion: 1,
        traceId: "trace",
      },
    ],
  };

  it.each([
    { executionId: "other-execution" },
    { projectId: "other-project" },
    { facetId: "other-facet" },
    { facetVersion: 2 },
    { traceId: "other-trace" },
  ])(
    "rejects a staged result outside the requested scope: %j",
    async (mismatch) => {
      const { executionId = batch.executionId, ...summaryMismatch } = mismatch;
      mocks.get.mockResolvedValue(
        JSON.stringify({
          executionId,
          summary: {
            projectId: batch.projectId,
            id: "summary",
            facetId: "facet",
            facetVersion: 1,
            traceId: "trace",
            ...summaryMismatch,
          },
        }),
      );
      await expect(
        readStagedTopicSummary(batch, batch.summaries[0]!),
      ).rejects.toThrow("scope mismatch");
    },
  );

  it.each(["summarized", "complete"])(
    "returns the accepted terminal result when a competing attempt reads %s",
    async (state) => {
      const accepted = {
        projectId: batch.projectId,
        id: "summary",
        facetId: "facet",
        facetVersion: 1,
        traceId: "trace",
        state: "complete",
        processedAt: "2026-09-22T10:00:00.000Z",
      } as TopicSummary;
      const payload = {
        executionId: batch.executionId,
        summary: accepted,
        embeddingConfig: {
          embeddingModel: "cohere.embed-v4:0",
          embeddingDimensions: 256,
        },
      };
      mocks.get.mockResolvedValue(
        JSON.stringify({ ...payload, summary: { ...accepted, state } }),
      );
      mocks.eval.mockResolvedValue(JSON.stringify(payload));
      await expect(
        updateStagedTopicSummary(batch, batch.summaries[0]!, {
          ...accepted,
          processedAt: "2026-09-22T10:01:00.000Z",
        }),
      ).resolves.toEqual(accepted);
    },
  );

  it("returns no accepted result when the staged payload has expired", async () => {
    mocks.get.mockResolvedValue(null);
    await expect(
      updateStagedTopicSummary(batch, batch.summaries[0]!, {} as TopicSummary),
    ).resolves.toBeNull();
    expect(mocks.eval).not.toHaveBeenCalled();
  });

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
