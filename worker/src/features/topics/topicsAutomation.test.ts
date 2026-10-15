import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicSummaryCounts,
  getEnabledTopicsModels,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionForRequest,
  TopicsAutomationQueue,
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
  prisma: { topicClusteringRun: { findFirst: vi.fn(async () => null) } },
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
  getTopicSummaryCounts: vi.fn(),
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
  beforeEach(() => vi.clearAllMocks());

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
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: null },
    ]);
    vi.mocked(getTopicSummaryCounts).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 99 },
    ]);

    await processTopicsAutomation(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();

    vi.mocked(getTopicSummaryCounts).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
    ]);
    await processTopicsAutomation(batch);
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
      .mockResolvedValueOnce({ id: "failed", status: "failed" } as Awaited<
        ReturnType<typeof readTopicExecutionForRequest>
      >);
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

  it("does not start discovery once automatic processing is off or the embedding model changed", async () => {
    vi.mocked(listTopicSummaries).mockResolvedValue([summary("near", [1, 0])]);
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, runId: null },
    ]);
    vi.mocked(getTopicSummaryCounts).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
    ]);
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
