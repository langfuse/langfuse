import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TopicFacet, TopicSummary } from "@langfuse/shared/topics";
import { listTopicFacets } from "@langfuse/shared/topics/server";
import { processTopicsTrace } from "./processTopicsTrace";
import { summarizeTraceFacetVersions } from "./summarizeAssembledTrace";
import { getServingTopicRun } from "./servingRuns";
import { signalTopicsDiscovery } from "./topicsAutomation";
import {
  pauseForRejectedConnection,
  TopicsProviderUnavailable,
} from "./provider-error";

const mocks = vi.hoisted(() => ({
  getInputs: vi.fn(),
  addToQueue: vi.fn(),
}));

vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  createTraceBatchInputStorage: () => ({ get: mocks.getInputs }),
  recordIncrement: vi.fn(),
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  getEnabledTopicsModels: vi.fn(
    async () => new Map([["project", { embedding: { model: "embed" } }]]),
  ),
  isTopicsProjectEnabled: () => true,
  isValidTopicSummary: () => true,
  listTopicFacets: vi.fn(),
  topicSummaryRecord: (row: unknown) => ({ summary: row }),
  topicAssignmentRecord: (row: unknown) => ({ assignment: row }),
}));
vi.mock("../../services/ClickhouseWriter", () => ({
  ClickhouseWriter: { getInstance: () => ({ addToQueue: mocks.addToQueue }) },
  TableName: {
    TopicFacetSummaries: "topic_facet_summaries",
    TopicAssignments: "topic_assignments",
  },
}));
vi.mock("./summarizeAssembledTrace", () => ({
  summarizeTraceFacetVersions: vi.fn(),
}));
vi.mock("./servingRuns", () => ({ getServingTopicRun: vi.fn() }));
vi.mock("./topicsAutomation", () => ({ signalTopicsDiscovery: vi.fn() }));
vi.mock("./assignments", () => ({
  topicAssignmentRows: () => [{ topicId: "billing" }],
}));
vi.mock("./models", () => ({ TopicInputTooLarge: class extends Error {} }));
vi.mock("./provider-error", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./provider-error")>()),
  pauseForRejectedConnection: vi.fn(),
}));

const facet = (id: string, version: number): TopicFacet => ({
  id,
  projectId: "project",
  name: id,
  description: "",
  isBuiltIn: true,
  versions: [
    { projectId: "project", facetId: id, version, prompt: "", createdAt: "" },
  ],
});

const row = (facetId: string, state: TopicSummary["state"]) =>
  ({
    projectId: "project",
    facetId,
    facetVersion: 2,
    traceId: "trace",
    state,
    embedding: state === "complete" ? [1, 0] : [],
    embeddingModel: "embed",
    unitStartTime: "2026-10-14T00:00:00.000Z",
  }) as TopicSummary;

const event = {
  projectId: "project",
  traceId: "trace",
  revision: "revision",
  transcriptS3Key: "key",
  facets: [
    { facetId: "intent", version: 2 },
    { facetId: "tone", version: 2 },
  ],
};

const scheduleRetry = vi.fn(async () => true);

describe("processTopicsTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listTopicFacets).mockResolvedValue([
      facet("intent", 2),
      facet("tone", 2),
    ]);
    mocks.getInputs.mockResolvedValue({
      transcript: null,
      executionIssues: [],
      traceContext: {
        sessionId: null,
        traceTimestamp: "2026-10-14T00:00:00.000Z",
        environment: "default",
        traceName: null,
      },
    });
  });

  it("summarizes current facet versions, assigns to the serving map, and signals discovery without one", async () => {
    vi.mocked(listTopicFacets).mockResolvedValue([
      facet("intent", 2),
      facet("tone", 3),
    ]);
    vi.mocked(summarizeTraceFacetVersions).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "complete")],
    });
    vi.mocked(getServingTopicRun).mockResolvedValueOnce(null);

    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "summarized" },
    );
    expect(
      vi.mocked(summarizeTraceFacetVersions).mock.calls[0][0].facets,
    ).toEqual([expect.objectContaining({ name: "intent" })]);
    expect(mocks.addToQueue).toHaveBeenCalledWith(
      "topic_facet_summaries",
      expect.anything(),
    );
    expect(signalTopicsDiscovery).toHaveBeenCalledOnce();

    vi.mocked(getServingTopicRun).mockResolvedValueOnce({ id: "run" } as never);
    mocks.addToQueue.mockClear();
    await processTopicsTrace(event, { scheduleRetry });
    expect(mocks.addToQueue).toHaveBeenCalledWith("topic_assignments", {
      assignment: { topicId: "billing" },
    });
  });

  it("skips the trace when every selected facet version is stale", async () => {
    vi.mocked(listTopicFacets).mockResolvedValue([facet("intent", 3)]);
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "stale" },
    );
    expect(mocks.getInputs).not.toHaveBeenCalled();
  });

  it("requeues only the facets that failed with a retryable provider error", async () => {
    vi.mocked(summarizeTraceFacetVersions).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "not_applicable")],
      failure: new TopicsProviderUnavailable("slow", "rate_limit"),
    });

    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "retry_scheduled" },
    );
    expect(scheduleRetry).toHaveBeenCalledWith([
      { facetId: "tone", version: 2 },
    ]);
    expect(mocks.addToQueue).toHaveBeenCalledOnce();

    scheduleRetry.mockResolvedValueOnce(false);
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "rate_limit" },
    );
  });

  it("pauses the project without retrying when the connection is rejected", async () => {
    vi.mocked(summarizeTraceFacetVersions).mockRejectedValue(
      new TopicsProviderUnavailable("denied", "authentication"),
    );
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "authentication" },
    );
    expect(pauseForRejectedConnection).toHaveBeenCalledOnce();
    expect(scheduleRetry).not.toHaveBeenCalled();
  });

  it("drops invalid stored input but rethrows a failed read", async () => {
    mocks.getInputs.mockRejectedValueOnce(new SyntaxError("bad json"));
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "invalid_input" },
    );

    mocks.getInputs.mockRejectedValueOnce(new Error("socket hang up"));
    await expect(processTopicsTrace(event, { scheduleRetry })).rejects.toThrow(
      "socket hang up",
    );
    expect(summarizeTraceFacetVersions).not.toHaveBeenCalled();
  });

  it("stores valid rows before rethrowing an internal error", async () => {
    vi.mocked(summarizeTraceFacetVersions).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "not_applicable")],
      failure: new Error("unexpected"),
    });
    await expect(processTopicsTrace(event, { scheduleRetry })).rejects.toThrow(
      "unexpected",
    );
    expect(mocks.addToQueue).toHaveBeenCalledOnce();
  });
});
