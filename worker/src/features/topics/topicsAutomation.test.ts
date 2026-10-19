import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicClusteringSummaryStats,
  getEnabledTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionForRequest,
  TopicsAutomationQueue,
  TOPIC_CLUSTERING_CAPACITY_ERROR,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicAssignment,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  enqueueTopicsAutomation,
  processTopicsAutomation,
} from "./topicsAutomation";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: {
    topicClusteringRun: {
      findFirst: vi.fn(async () => null),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
  },
}));

const discoveryGate = vi.hoisted(() => vi.fn(async () => "OK"));
const releaseDiscoveryGate = vi.hoisted(() => vi.fn());
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  redis: { set: discoveryGate, del: releaseDiscoveryGate },
}));

const add = vi.fn();
vi.mock("@langfuse/shared/topics/server", () => ({
  TOPICS_SYSTEM_USER_ID: "system:topics",
  TOPICS_TRACE_BATCH_SIZE: 100,
  TopicsAutomationQueue: { getInstance: vi.fn(() => ({ add })) },
  createTopicExecution: vi.fn(async () => ({ id: "execution" })),
  enqueueTopicExecution: vi.fn(),
  getTopicProcessingMapIds: vi.fn(),
  getTopicRun: vi.fn(),
  getTopicClusteringSummaryStats: vi.fn(),
  TOPIC_CLUSTERING_CAPACITY_ERROR:
    "Topics clustering exceeds this worker's capacity. Choose a smaller time window; no partial cohort was used.",
  getEnabledTopicsModels: vi.fn(
    async () =>
      new Map([["project", { embedding: { model: "embed", dimensions: 2 } }]]),
  ),
  listTopicSummaries: vi.fn(),
  readTopicAssignments: vi.fn(async () => []),
  readTopicExecutionForRequest: vi.fn(async () => null),
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
    discoveryGate.mockResolvedValue("OK");
    vi.mocked(readTopicExecutionForRequest).mockResolvedValue(null);
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
    expect(TopicsAutomationQueue.getInstance).toHaveBeenCalled();
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

  it("starts one first discovery per facet version once enough summaries exist", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: null },
    ]);
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 99,
      bytes: 1000,
    });

    await processTopicsAutomation(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();

    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 100,
      bytes: 1000,
    });
    discoveryGate.mockResolvedValueOnce(null as never);
    await processTopicsAutomation(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ payload: batch }),
      expect.objectContaining({ delay: 60_000, jobId: expect.any(String) }),
    );
    // BullMQ retains the first payload when another batch queues the same ID.
    const deferred = add.mock.lastCall![1].payload;
    const deferredId = add.mock.lastCall![2].jobId;
    discoveryGate.mockResolvedValueOnce(null as never);
    await processTopicsAutomation({ ...batch, traceIds: ["latest-batch"] });
    expect(add.mock.lastCall![2].jobId).toBe(deferredId);
    // That first batch is no longer eligible, but the facet now has 100 summaries.
    vi.mocked(listTopicSummaries).mockResolvedValueOnce([]);
    await processTopicsAutomation(deferred);
    expect(createTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project",
        operation: "update",
        facets: [{ facetId: "facet", version: 2 }],
        embeddingConfig: { embeddingModel: "embed", embeddingDimensions: 2 },
        exploratory: false,
      }),
      expect.any(String),
      "system:topics",
    );
    expect(enqueueTopicExecution).toHaveBeenCalledWith("project", "execution");

    // Started before: a queued one is queued again, a failed one is left for Resume.
    vi.mocked(createTopicExecution).mockClear();
    vi.mocked(enqueueTopicExecution).mockClear();
    vi.mocked(readTopicExecutionForRequest)
      .mockResolvedValueOnce({ id: "queued", status: "queued" } as Awaited<
        ReturnType<typeof readTopicExecutionForRequest>
      >)
      .mockResolvedValueOnce({
        id: "failed",
        status: "failed",
        facets: [],
      } as unknown as Awaited<ReturnType<typeof readTopicExecutionForRequest>>);
    await processTopicsAutomation(batch);
    await processTopicsAutomation(batch);
    expect(vi.mocked(enqueueTopicExecution).mock.calls).toEqual([
      ["project", "queued"],
    ]);
    vi.mocked(prisma.topicClusteringRun.findFirst).mockResolvedValueOnce({
      id: "incompatible",
    } as never);
    await processTopicsAutomation(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();
  });

  it.each([
    { count: 100_000, bytes: 1000, midpointTooSmall: false },
    { count: 100, bytes: 300 * 1024 * 1024, midpointTooSmall: false },
    { count: 100_000, bytes: 1000, midpointTooSmall: true },
  ])(
    "narrows automatic discovery before queuing the shared update pipeline: %j",
    async ({ midpointTooSmall, ...oversized }) => {
      vi.mocked(listTopicSummaries).mockResolvedValue([
        summary("near", [1, 0]),
      ]);
      vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
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

  it("defers an inseparable oversized cohort without creating executions or probing every batch", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
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
    discoveryGate.mockResolvedValueOnce(null as never);
    await processTopicsAutomation(batch);
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledTimes(checks);
    const recheckId = add.mock.lastCall![2].jobId;
    discoveryGate.mockResolvedValueOnce(null as never);
    await processTopicsAutomation(batch);
    expect(add.mock.lastCall![2].jobId).toBe(recheckId);
  });

  it("releases the discovery cooldown after a failed probe so queue retries can run", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
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

  it("recovers a capacity failure once with a new frozen request and releases its orphaned pending run", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 100,
      bytes: 1000,
    });
    const failed = {
      id: "failed",
      status: "completed_with_errors",
      facets: [
        {
          facetId: "facet",
          facetVersion: 2,
          runId: "orphaned",
          outcome: "failed",
          error: TOPIC_CLUSTERING_CAPACITY_ERROR,
        },
      ],
    } as unknown as NonNullable<
      Awaited<ReturnType<typeof readTopicExecutionForRequest>>
    >;
    vi.mocked(readTopicExecutionForRequest)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce(null);

    await processTopicsAutomation(batch);

    const [original, replacement] = vi
      .mocked(readTopicExecutionForRequest)
      .mock.calls.map((args) => args[1]);
    expect(replacement).not.toBe(original);
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
    expect(createTopicExecution).toHaveBeenCalledWith(
      expect.objectContaining({ requestId: replacement }),
      replacement,
      "system:topics",
    );

    vi.mocked(readTopicExecutionForRequest)
      .mockResolvedValueOnce(failed)
      .mockResolvedValueOnce({ ...failed, id: "replacement-failed" });
    await processTopicsAutomation(batch);
    expect(createTopicExecution).toHaveBeenCalledOnce();
    expect(getTopicClusteringSummaryStats).toHaveBeenCalledOnce();
  });

  it("does not start discovery once automatic processing is off or the embedding model changed", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: null },
    ]);
    vi.mocked(getTopicClusteringSummaryStats).mockResolvedValue({
      count: 100,
      bytes: 1000,
    });
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
