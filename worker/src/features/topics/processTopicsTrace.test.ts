import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { recordIncrement } from "@langfuse/shared/src/server";
import type {
  TopicFacet,
  TopicRule,
  TopicSummary,
} from "@langfuse/shared/topics";
import {
  listTopicFacets,
  listTopicRules,
} from "@langfuse/shared/topics/server";
import { processTopicsTrace } from "./processTopicsTrace";
import { summarizeAssembledTrace } from "./summarizeAssembledTrace";
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
  listTopicRules: vi.fn(),
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
  summarizeAssembledTrace: vi.fn(),
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

const rule = (id: string, facetIds: string[]) =>
  ({ id, projectId: "project", facetIds }) as TopicRule;

const event = {
  projectId: "project",
  traceId: "trace",
  revision: "revision",
  ruleIds: ["rule"],
};

const scheduleRetry = vi.fn(
  async (): Promise<"scheduled" | "skipped" | "queue_unavailable"> =>
    "scheduled",
);

describe("processTopicsTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Expires the per-pod settings cache between tests.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 60_000);
    vi.mocked(listTopicRules).mockResolvedValue([
      rule("rule", ["intent", "tone"]),
    ]);
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

  it("summarizes each facet its rules select once, assigns to the serving map, and signals discovery without one", async () => {
    vi.mocked(listTopicRules).mockResolvedValue([
      rule("rule", ["intent"]),
      rule("other", ["intent", "deleted-facet"]),
      rule("unselected", ["tone"]),
    ]);
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "complete")],
    });
    vi.mocked(getServingTopicRun).mockResolvedValueOnce(null);
    const twoRules = { ...event, ruleIds: ["rule", "other", "deleted-rule"] };

    await expect(
      processTopicsTrace(twoRules, { scheduleRetry }),
    ).resolves.toEqual({ outcome: "summarized" });
    expect(vi.mocked(summarizeAssembledTrace).mock.calls[0][0].facets).toEqual([
      expect.objectContaining({ name: "intent" }),
    ]);
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

  it("skips the trace when its rules no longer select a facet", async () => {
    vi.mocked(listTopicRules).mockResolvedValue([rule("other", ["intent"])]);
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "stale" },
    );
    expect(mocks.getInputs).not.toHaveBeenCalled();
  });

  it("requeues only the facets that failed with a retryable provider error, falling back to BullMQ when the requeue fails", async () => {
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "not_applicable")],
      failure: new TopicsProviderUnavailable("slow", "rate_limit"),
    });

    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "retry_scheduled", failedStage: "summary" },
    );
    expect(scheduleRetry).toHaveBeenCalledWith(["tone"]);
    expect(mocks.addToQueue).toHaveBeenCalledOnce();

    // The retried event summarizes only the facets it names and reports the failed stage.
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [],
      failure: new TopicsProviderUnavailable("slow", "rate_limit"),
      failedStage: "embedding",
    });
    await expect(
      processTopicsTrace(
        { ...event, facetIds: ["tone"] },
        { scheduleRetry, attempt: 1 },
      ),
    ).resolves.toEqual({
      outcome: "retry_scheduled",
      failedStage: "embedding",
    });
    expect(vi.mocked(summarizeAssembledTrace).mock.lastCall![0]).toMatchObject({
      facets: [expect.objectContaining({ name: "tone" })],
      attempt: "retry",
    });
    expect(recordIncrement).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcomes",
      1,
      {
        source: "trace_queue",
        outcome: "retry_scheduled",
        attempt: "retry",
        failed_stage: "embedding",
      },
    );

    scheduleRetry.mockResolvedValueOnce("skipped");
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "rate_limit", failedStage: "embedding" },
    );

    scheduleRetry.mockResolvedValueOnce("queue_unavailable");
    await expect(processTopicsTrace(event, { scheduleRetry })).rejects.toThrow(
      "slow",
    );
  });

  it("pauses the project without retrying when the connection is rejected", async () => {
    vi.mocked(summarizeAssembledTrace).mockRejectedValue(
      new TopicsProviderUnavailable("denied", "authentication"),
    );
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "authentication", failedStage: "summary" },
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
    expect(summarizeAssembledTrace).not.toHaveBeenCalled();
  });

  it("stores valid rows before rethrowing an internal error, but fails schema-invalid output without retrying", async () => {
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "not_applicable")],
      failure: new Error("unexpected"),
    });
    await expect(processTopicsTrace(event, { scheduleRetry })).rejects.toThrow(
      "unexpected",
    );
    expect(mocks.addToQueue).toHaveBeenCalledOnce();

    vi.mocked(summarizeAssembledTrace).mockRejectedValue(
      z.object({ summary: z.string() }).safeParse({}).error,
    );
    await expect(processTopicsTrace(event, { scheduleRetry })).resolves.toEqual(
      { outcome: "failed", reason: "invalid_output", failedStage: "summary" },
    );
    expect(scheduleRetry).not.toHaveBeenCalled();
  });
});
