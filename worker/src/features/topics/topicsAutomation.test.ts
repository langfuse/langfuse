import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getTopicProcessingMapIds,
  getTopicRun,
  listTopicSummaries,
  readTopicAssignments,
  writeTopicAssignments,
} from "@langfuse/shared/topics/server";
import type {
  TopicAssignment,
  TopicRun,
  TopicSummary,
} from "@langfuse/shared/topics";
import { processTopicsAutomation } from "./topicsAutomation";

vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicProcessingMapIds: vi.fn(),
  getTopicRun: vi.fn(),
  listTopicSummaries: vi.fn(),
  readTopicAssignments: vi.fn(async () => []),
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
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listTopicSummaries).mockReset();
    vi.mocked(getTopicProcessingMapIds).mockResolvedValue([]);
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
  });
});
