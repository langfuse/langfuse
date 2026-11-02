import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicClusteringSummaryStats,
  getTopicExecutionQueueState,
  getEnabledTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionSummary,
  TOPIC_CLUSTERING_CAPACITY_ERROR,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicAssignment,
  TopicExecutionSummary,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  enqueueTopicsAutomation,
  processTopicsAutomation,
} from "./topicsAutomation";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    batchAction: { findFirst: vi.fn(async () => null) },
    topicClusteringRun: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

const discoveryGate = vi.hoisted(() =>
  vi.fn<(key: string, ...args: unknown[]) => Promise<string | null>>(
    async () => "OK",
  ),
);
const releaseDiscoveryGate = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  redis: { set: discoveryGate, del: releaseDiscoveryGate },
}));

const add = vi.fn();
vi.mock("@langfuse/shared/topics/server", () => ({
  TOPICS_ACTION: "topics",
  TOPICS_SYSTEM_USER_ID: "system:topics",
  TOPICS_TRACE_BATCH_SIZE: 100,
  TopicsAutomationQueue: { getInstance: vi.fn(() => ({ add })) },
  createTopicExecution: vi.fn(async () => ({ id: "execution" })),
  enqueueTopicExecution: vi.fn(),
  getTopicProcessingMapIds: vi.fn(),
  getTopicRun: vi.fn(),
  getTopicClusteringSummaryStats: vi.fn(),
  getTopicExecutionQueueState: vi.fn(async () => "active"),
  TOPIC_CLUSTERING_CAPACITY_ERROR:
    "Topics clustering exceeds this worker's capacity. Choose a smaller time window; no partial cohort was used.",
  getEnabledTopicsModels: vi.fn(
    async () =>
      new Map([["project", { embedding: { model: "embed", dimensions: 2 } }]]),
  ),
  listTopicSummaries: vi.fn(),
  readTopicAssignments: vi.fn(async () => []),
  readTopicExecutionSummary: vi.fn(async () => null),
  writeTopicAssignments: vi.fn(),
}));

const summary = (
  traceId: string,
  embedding: number[],
  overrides: Partial<TopicSummary> = {},
) =>
  ({
    projectId: "project",
    facetId: "facet",
    facetVersion: 2,
    traceId,
    sessionId: null,
    state: "complete",
    embedding,
    embeddingModel: "embed",
    environment: "default",
    traceName: "trace",
    unitStartTime: "2026-10-14T00:00:00.000Z",
    processedAt: "2026-10-14T00:01:00.000Z",
    ...overrides,
  }) as TopicSummary;

const batch = {
  projectId: "project",
  traceIds: ["near", "far", "assigned"],
  facets: [{ facetId: "facet", version: 2 }],
  embeddingConfig: { embeddingModel: "embed", embeddingDimensions: 2 },
  timeRange: {
    from: new Date("2026-10-14T00:00:00.000Z"),
    to: new Date("2026-10-14T00:00:00.001Z"),
  },
};

const run: TopicRun = {
  id: "run",
  projectId: "project",
  facetId: "facet",
  facetVersion: 2,
  status: "completed",
  createdAt: "2026-10-13T00:00:00.000Z",
  startedAt: null,
  finishedAt: null,
  config: { embeddingModel: "embed", dimensions: 2 },
  error: null,
  topics: [
    {
      topicId: "billing",
      topicVersionId: "billing-v1",
      centroid: [1, 0],
      radius: 0.1,
    } as TopicRun["topics"][number],
  ],
};

describe("automatic Topics assignment", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listTopicSummaries).mockReset();
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 100,
      bytes: 1000,
    });
    discoveryGate.mockResolvedValue("OK");
    vi.mocked(readTopicExecutionSummary).mockReset();
    vi.mocked(prisma.batchAction.findFirst).mockResolvedValue(null);
    vi.mocked(createTopicExecution).mockResolvedValue({
      id: "execution",
    } as never);
    vi.mocked(enqueueTopicExecution).mockReset();
    vi.mocked(getTopicExecutionQueueState).mockResolvedValue("active");
    vi.mocked(prisma.topicClusteringRun.findFirst).mockResolvedValue(null);
  });

  it("queues each project's stored complete summaries once per batch, 100 traces per job", async () => {
    const rows = [
      ...Array.from({ length: 101 }, (_, index) =>
        summary(`trace-${index}`, [1, 0]),
      ),
      summary("skipped", [1, 0], { state: "not_applicable" }),
      summary("other", [1, 0], { projectId: "other-project" }),
    ];

    await enqueueTopicsAutomation("batch", rows);
    await enqueueTopicsAutomation("batch", rows);

    const jobs = add.mock.calls.map(([, data, options]) => ({
      jobId: options.jobId,
      projectId: data.payload.projectId,
      traceCount: data.payload.traceIds.length,
    }));
    expect(jobs.slice(0, 3)).toEqual([
      { jobId: expect.any(String), projectId: "project", traceCount: 100 },
      { jobId: expect.any(String), projectId: "project", traceCount: 1 },
      { jobId: expect.any(String), projectId: "other-project", traceCount: 1 },
    ]);
    // A retried batch reuses its job IDs, so BullMQ queues nothing twice.
    expect(jobs.slice(3)).toEqual(jobs.slice(0, 3));

    // A retry that stores a facet the first attempt failed queues a new job.
    add.mockClear();
    await enqueueTopicsAutomation("batch", [
      summary("other", [1, 0], { projectId: "other-project" }),
      summary("other", [1, 0], { projectId: "other-project", facetId: "b" }),
    ]);
    expect(add.mock.calls[0][2].jobId).not.toBe(jobs[2].jobId);
  });

  it("assigns not-yet-assigned complete summaries onto the compatible serving map", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([
      summary("near", [1, 0.01]),
      summary("far", [0, 1]),
      summary("assigned", [1, 0]),
      summary("old-space", [1, 0], { embeddingModel: "other" }),
    ]);
    vi.mocked(readTopicAssignments).mockResolvedValue([
      {
        traceId: "assigned",
        summaryProcessedAt: "2026-10-14T00:01:00.000Z",
      } as TopicAssignment,
    ]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: "run" },
    ]);
    vi.mocked(getTopicRun).mockResolvedValue(run);

    await processTopicsAutomation(batch);

    expect(
      vi
        .mocked(writeTopicAssignments)
        .mock.calls[0][0].map(({ traceId, topicId, origin }) => ({
          traceId,
          topicId,
          origin,
        })),
    ).toEqual([
      { traceId: "near", topicId: "billing", origin: "online" },
      { traceId: "far", topicId: null, origin: "online" },
    ]);
    expect(createTopicExecution).not.toHaveBeenCalled();
  });

  it("waits for enough summaries and rechecks a deferred batch after the cooldown", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([]);
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValueOnce({
      count: 99,
      bytes: 1000,
    });
    await processTopicsAutomation(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();

    discoveryGate.mockResolvedValueOnce(null);
    await processTopicsAutomation(batch);
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledTimes(1);
    expect(createTopicExecution).not.toHaveBeenCalled();

    // Discovery uses the current facet cohort even if this batch no longer has summaries.
    await processTopicsAutomation(add.mock.lastCall![1].payload);
    expect(createTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        operation: "update",
        facets: batch.facets,
        embeddingConfig: batch.embeddingConfig,
        exploratory: false,
      }),
      expect.any(String),
      "system:topics",
    );
    expect(enqueueTopicExecution).toHaveBeenCalledWith("project", "execution");
  });

  it.each([
    { count: 19_990, bytes: 1000, midpointTooSmall: true },
    { count: 100, bytes: 250 * 1024 * 1024, midpointTooSmall: false },
  ])(
    "narrows automatic discovery before queuing the shared update pipeline: %j",
    async ({ midpointTooSmall, ...oversized }) => {
      vi.mocked(getTopicClusteringSummaryStats)
        .mockResolvedValueOnce(oversized)
        .mockResolvedValue({ count: 100, bytes: 1000 });
      if (midpointTooSmall)
        vi.mocked(getTopicClusteringSummaryStats).mockResolvedValueOnce({
          count: 50,
          bytes: 500,
        });

      await processTopicsAutomation(batch);

      const windows = vi
        .mocked(getTopicClusteringSummaryStats)
        .mock.calls.map((args) => args[4]);
      expect(windows).toHaveLength(midpointTooSmall ? 3 : 2);
      expect(windows[0].to.getTime() - windows[0].from.getTime()).toBe(
        7 * 24 * 60 * 60_000,
      );
      expect(windows[1].to).toEqual(windows[0].to);
      expect(windows[1].from.getTime()).toBeGreaterThan(
        windows[0].from.getTime(),
      );
      if (midpointTooSmall)
        expect(windows[2].from.getTime()).toBeLessThan(
          windows[1].from.getTime(),
        );
      expect(createTopicExecution).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "update",
          timeRange: windows.at(-1),
          exploratory: false,
        }),
        expect.any(String),
        "system:topics",
      );
      expect(enqueueTopicExecution).toHaveBeenCalledWith(
        "project",
        "execution",
      );
    },
  );

  it("bounds probes for an inseparable oversized cohort and observes the cooldown", async () => {
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 100_000,
      bytes: 1000,
    });

    await processTopicsAutomation(batch);
    const checks = vi.mocked(getTopicClusteringSummaryStats).mock.calls.length;
    expect(checks).toBeGreaterThan(1);
    expect(checks).toBeLessThanOrEqual(32);
    expect(createTopicExecution).not.toHaveBeenCalled();
    expect(discoveryGate).toHaveBeenCalledWith(
      expect.stringContaining("project"),
      "1",
      "EX",
      60,
      "NX",
    );
    discoveryGate.mockResolvedValueOnce(null);
    await processTopicsAutomation(batch);
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledTimes(checks);
  });

  it("releases the discovery cooldown after a failed probe so queue retries can run", async () => {
    vi.mocked(getTopicClusteringSummaryStats).mockRejectedValueOnce(
      new Error("temporary failure"),
    );
    await expect(processTopicsAutomation(batch)).rejects.toThrow(
      "temporary failure",
    );
    expect(releaseDiscoveryGate).toHaveBeenCalledWith(
      expect.stringContaining("langfuse:topics:discovery:project:"),
    );
  });

  it("recovers late-arrival capacity failures until a smaller frozen request succeeds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 12_000,
      bytes: 1000,
    });
    let latest: TopicExecutionSummary | null = null;
    let cooldown = 0;
    discoveryGate.mockImplementation(async () => {
      if (Date.now() < cooldown) return null;
      cooldown = Date.now() + 60_000;
      return "OK";
    });
    vi.mocked(prisma.batchAction.findFirst).mockImplementation(
      async () => (latest ? { id: latest.id } : null) as never,
    );
    vi.mocked(readTopicExecutionSummary).mockImplementation(async () => latest);
    vi.mocked(createTopicExecution).mockImplementation(async (input) => {
      latest = {
        id: input.requestId,
        input,
        status: "queued",
        facets: [],
      } as unknown as TopicExecutionSummary;
      return latest as Awaited<ReturnType<typeof createTopicExecution>>;
    });
    vi.mocked(enqueueTopicExecution).mockImplementation(async () => {
      // The check is queued before dispatch, even when no further batches arrive.
      expect(add).toHaveBeenCalled();
      // Late summaries push the first two admitted cohorts past the hard guard.
      const overflow = vi.mocked(createTopicExecution).mock.calls.length < 3;
      latest = {
        ...latest!,
        status: overflow ? "completed_with_errors" : "completed",
        facets: [
          {
            facetId: "facet",
            facetVersion: 2,
            runId: "orphaned",
            outcome: overflow ? "failed" : "published",
            error: overflow ? TOPIC_CLUSTERING_CAPACITY_ERROR : null,
          },
        ],
      } as TopicExecutionSummary;
    });

    await processTopicsAutomation(batch);
    for (let attempt = 0; attempt < 2; attempt++) {
      await processTopicsAutomation(batch);
      expect(createTopicExecution).toHaveBeenCalledTimes(attempt + 1);
      const deferred = add.mock.lastCall![1].payload;
      vi.setSystemTime(Date.now() + 60_000);
      await Promise.all([
        processTopicsAutomation(deferred),
        processTopicsAutomation(deferred),
      ]);
    }
    await processTopicsAutomation(add.mock.lastCall![1].payload);

    const inputs = vi
      .mocked(createTopicExecution)
      .mock.calls.map(([input]) => input);
    expect(inputs).toHaveLength(3);
    expect(new Set(inputs.map((input) => input.requestId)).size).toBe(3);
    expect(
      inputs.map((input) =>
        input.operation === "update"
          ? input.timeRange.to.getTime() - input.timeRange.from.getTime()
          : 0,
      ),
    ).toEqual([7, 3.5, 1.75].map((days) => days * 24 * 60 * 60_000));
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledTimes(3);
    expect(new Set(discoveryGate.mock.calls.map(([key]) => key)).size).toBe(1);
    expect(prisma.topicClusteringRun.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: "project",
        id: "orphaned",
        facetId: "facet",
        facetVersion: 2,
        status: "pending",
      },
      data: {
        status: "failed",
        error: TOPIC_CLUSTERING_CAPACITY_ERROR,
        finishedAt: expect.any(Date),
      },
    });
  });

  it.each([
    { status: "queued", state: "failed", capacityFailure: false, monitors: 1 },
    {
      status: "queued",
      state: "completed",
      capacityFailure: false,
      monitors: 1,
    },
    { status: "queued", state: "missing", capacityFailure: false, monitors: 1 },
    { status: "failed", state: "failed", capacityFailure: false, monitors: 0 },
    { status: "running", state: "active", capacityFailure: false, monitors: 1 },
    { status: "running", state: "failed", capacityFailure: false, monitors: 0 },
    {
      status: "running",
      state: "missing",
      capacityFailure: false,
      monitors: 0,
    },
    { status: "running", state: "failed", capacityFailure: true, monitors: 1 },
  ] as const)(
    "recovers queued work and monitors active work or a racing capacity failure: %j",
    async ({ status, state, capacityFailure, monitors }) => {
      vi.mocked(prisma.batchAction.findFirst).mockResolvedValue({
        id: "running",
      } as never);
      const running = {
        id: "running",
        status,
        facets: [],
      } as unknown as TopicExecutionSummary;
      vi.mocked(readTopicExecutionSummary)
        .mockResolvedValueOnce(running)
        .mockResolvedValue(
          capacityFailure
            ? ({
                ...running,
                status: "completed_with_errors",
                facets: [
                  {
                    facetId: "facet",
                    facetVersion: 2,
                    outcome: "failed",
                    error: TOPIC_CLUSTERING_CAPACITY_ERROR,
                  },
                ],
              } as TopicExecutionSummary)
            : running,
        );
      vi.mocked(getTopicExecutionQueueState).mockResolvedValue(state);

      await processTopicsAutomation(batch);

      expect(add).toHaveBeenCalledTimes(monitors);
      expect(createTopicExecution).not.toHaveBeenCalled();
      expect(vi.mocked(enqueueTopicExecution).mock.calls).toEqual(
        status === "queued" ? [[batch.projectId, running.id]] : [],
      );
    },
  );

  it("does not start discovery once automatic processing is off or the embedding model changed", async () => {
    vi.mocked(getEnabledTopicsModels)
      .mockResolvedValueOnce(new Map())
      .mockResolvedValueOnce(
        new Map([
          ["project", { embedding: { model: "new-embed", dimensions: 2 } }],
        ]) as Awaited<ReturnType<typeof getEnabledTopicsModels>>,
      );

    await processTopicsAutomation(batch);
    await processTopicsAutomation(batch);

    expect(createTopicExecution).not.toHaveBeenCalled();
  });
});
