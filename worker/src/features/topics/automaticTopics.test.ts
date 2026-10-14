import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@langfuse/shared/src/db";
import {
  createTopicExecution,
  enqueueTopicExecution,
  getTopicProcessingMapIds,
  getTopicRun,
  getTopicSummaryCounts,
  listTopicSummaries,
  readTopicAssignments,
  readTopicExecutionForRequest,
  TopicsAutomaticQueue,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicAssignment,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  enqueueAutomaticTopicAssignments,
  processAutomaticTopicAssignments,
} from "./automaticTopics";

vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { topicClusteringRun: { findFirst: vi.fn() } },
}));

const add = vi.fn();
vi.mock("@langfuse/shared/topics/server", () => ({
  TOPICS_SYSTEM_USER_ID: "system:topics",
  TOPICS_TRACE_BATCH_SIZE: 100,
  TopicsAutomaticQueue: { getInstance: vi.fn(() => ({ add })) },
  createTopicExecution: vi.fn(async () => ({ id: "execution" })),
  enqueueTopicExecution: vi.fn(),
  getTopicProcessingMapIds: vi.fn(),
  getTopicRun: vi.fn(),
  getTopicSummaryCounts: vi.fn(),
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

    await enqueueAutomaticTopicAssignments("batch", rows);
    await enqueueAutomaticTopicAssignments("batch", rows);

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
    expect(TopicsAutomaticQueue.getInstance).toHaveBeenCalled();
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

    await processAutomaticTopicAssignments(batch);

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

    await processAutomaticTopicAssignments(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();

    vi.mocked(getTopicSummaryCounts).mockResolvedValue([
      { facetId: "facet", facetVersion: 2, count: 100 },
    ]);
    await processAutomaticTopicAssignments(batch);
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

    // Started before, or replaced by an existing map: no further discovery.
    vi.mocked(createTopicExecution).mockClear();
    vi.mocked(readTopicExecutionForRequest).mockResolvedValueOnce(
      {} as Awaited<ReturnType<typeof readTopicExecutionForRequest>>,
    );
    await processAutomaticTopicAssignments(batch);
    vi.mocked(prisma.topicClusteringRun.findFirst).mockResolvedValueOnce({
      id: "incompatible",
    } as never);
    await processAutomaticTopicAssignments(batch);
    expect(createTopicExecution).not.toHaveBeenCalled();
  });
});
