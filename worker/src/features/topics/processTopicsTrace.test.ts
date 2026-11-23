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
  readTopicExecutionSummary,
  recordTopicSnapshotProcessingCost,
} from "@langfuse/shared/topics/server";
import { bufferTopicRuleProcessingCosts } from "./processingCostBuffer";
import { processTopicsTrace } from "./processTopicsTrace";
import { summarizeAssembledTrace } from "./summarizeAssembledTrace";
import { getRuleTopicRun } from "./servingRuns";
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
  createTraceTranscriptStorage: () => ({ get: mocks.getInputs }),
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
  readTopicExecutionSummary: vi.fn(),
  recordTopicSnapshotProcessingCost: vi.fn(async () => {}),
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
vi.mock("./processingCostBuffer", () => ({
  bufferTopicRuleProcessingCosts: vi.fn(async () => {}),
}));
vi.mock("./servingRuns", () => ({ getRuleTopicRun: vi.fn() }));
vi.mock("./assignments", () => ({
  topicAssignmentRows: ({ run }: { run: { id: string } }) => [
    { topicId: "billing", runId: run.id },
  ],
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
  transcriptS3Path: "stored.json",
  ruleIds: ["rule"],
};

const storedInputs = {
  transcript: null,
  executionIssues: [],
  traceContext: {
    sessionId: null,
    traceTimestamp: "2026-10-14T00:00:00.000Z",
    environment: "default",
    traceName: null,
  },
};

const scheduleRetry = vi.fn(
  async (): Promise<"scheduled" | "skipped" | "queue_unavailable"> =>
    "scheduled",
);

describe("processTopicsTrace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Expires the per-pod settings cache between tests.
    vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
    vi.setSystemTime(Date.now() + 60_000);
    vi.mocked(listTopicRules).mockResolvedValue([
      rule("rule", ["intent", "tone"]),
    ]);
    vi.mocked(listTopicFacets).mockResolvedValue([
      facet("intent", 2),
      facet("tone", 2),
    ]);
    mocks.getInputs.mockResolvedValue(storedInputs);
  });

  it("summarizes each facet its rules select once and assigns it to the map of every matched rule that has one", async () => {
    vi.mocked(listTopicRules).mockResolvedValue([
      rule("rule", ["intent"]),
      rule("other", ["intent", "deleted-facet"]),
      rule("mapped", ["intent"]),
      rule("unmatched", ["intent", "tone"]),
    ]);
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [row("intent", "complete")],
    });
    vi.mocked(getRuleTopicRun).mockImplementation(
      async (_project, ruleId) =>
        (ruleId === "other" ? null : { id: `${ruleId}-map` }) as never,
    );
    const matched = {
      ...event,
      ruleIds: ["rule", "other", "mapped", "deleted-rule"],
    };

    await expect(
      processTopicsTrace(matched, { scheduleRetry }),
    ).resolves.toEqual({ outcome: "summarized" });
    expect(vi.mocked(summarizeAssembledTrace).mock.calls[0][0].facets).toEqual([
      expect.objectContaining({ name: "intent" }),
    ]);
    expect(mocks.addToQueue).toHaveBeenCalledWith(
      "topic_facet_summaries",
      expect.anything(),
    );
    // "other" has no map yet; "unmatched" has one but the trace didn't match it.
    const assigned = mocks.addToQueue.mock.calls
      .filter(([table]) => table === "topic_assignments")
      .map(([, record]) => record.assignment.runId);
    expect(assigned).toEqual(["rule-map", "mapped-map"]);
  });

  it("summarizes a snapshot's facets without a rule and tags the summaries with the snapshot", async () => {
    vi.mocked(readTopicExecutionSummary).mockResolvedValue({
      status: "running",
      input: { operation: "update", facets: [{ facetId: "tone", version: 2 }] },
    } as never);
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [row("tone", "complete")],
    });

    await expect(
      processTopicsTrace(
        { ...event, ruleIds: [], batchActionId: "snapshot" },
        { scheduleRetry },
      ),
    ).resolves.toEqual({ outcome: "summarized" });
    expect(vi.mocked(summarizeAssembledTrace).mock.calls[0][0]).toMatchObject({
      facets: [expect.objectContaining({ name: "tone" })],
      executionId: "snapshot",
    });
    // No rule matched, so nothing is assigned online; the snapshot's fit assigns.
    expect(
      mocks.addToQueue.mock.calls.filter(
        ([table]) => table === "topic_assignments",
      ),
    ).toEqual([]);
  });

  it("records each snapshot attempt even when it produces no rows and retries only the receipt write", async () => {
    vi.mocked(readTopicExecutionSummary).mockResolvedValue({
      status: "running",
      input: { operation: "update", facets: [{ facetId: "tone", version: 2 }] },
    } as never);
    vi.mocked(summarizeAssembledTrace).mockImplementation(
      async ({ onModelCost }) => {
        onModelCost?.("summary", 0.025, ["rule"]);
        onModelCost?.("embedding", null, ["rule"]);
        return {
          outcome: "summarized",
          rows: [],
          failure: new TopicsProviderUnavailable("slow", "timeout"),
          failedStage: "embedding",
        };
      },
    );
    const snapshotEvent = { ...event, ruleIds: [], batchActionId: "snapshot" };
    vi.mocked(recordTopicSnapshotProcessingCost).mockRejectedValueOnce(
      new Error("connection lost"),
    );

    await expect(
      processTopicsTrace(snapshotEvent, { scheduleRetry }),
    ).resolves.toEqual({
      outcome: "retry_scheduled",
      failedStage: "embedding",
    });
    const records = vi.mocked(recordTopicSnapshotProcessingCost).mock.calls;
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual(records[1]);
    expect(records[0][0]).toMatchObject({
      projectId: "project",
      executionId: "snapshot",
      revision: event.revision,
      reportId: expect.any(String),
      cost: 0.025,
      partial: true,
    });
    vi.mocked(summarizeAssembledTrace).mockImplementationOnce(
      async ({ onModelCost }) => {
        onModelCost?.("summary", 0.025, ["rule"]);
        onModelCost?.("embedding", 0.005, ["rule"]);
        return { outcome: "summarized", rows: [] };
      },
    );
    await processTopicsTrace(snapshotEvent, { scheduleRetry, attempt: 1 });
    expect(records[2][0]).toMatchObject({
      cost: expect.closeTo(0.03, 12),
      partial: false,
    });
    expect(records[2][0].reportId).not.toEqual(records[0][0].reportId);
    mocks.getInputs.mockRejectedValueOnce(new SyntaxError("bad input"));
    await processTopicsTrace(snapshotEvent, { scheduleRetry });
    expect(records[3][0]).toMatchObject({ cost: 0, partial: false });
    vi.mocked(summarizeAssembledTrace).mockImplementationOnce(
      async ({ onModelCost }) => {
        onModelCost?.("summary", null, ["rule"]);
        throw new TopicsProviderUnavailable("denied", "authentication");
      },
    );
    await processTopicsTrace(snapshotEvent, { scheduleRetry });
    expect(records[4][0]).toMatchObject({ cost: null, partial: true });
    expect(bufferTopicRuleProcessingCosts).not.toHaveBeenCalled();
  });

  it("shares each live stage between participating rules, including paid retries without rows", async () => {
    const secondRule = rule("second", ["tone"]);
    vi.mocked(listTopicRules).mockResolvedValue([
      rule("rule", ["tone", "intent"]),
      secondRule,
    ]);
    const matched = { ...event, ruleIds: ["rule", secondRule.id] };
    vi.mocked(summarizeAssembledTrace).mockImplementationOnce(
      async ({ onModelCost }) => {
        onModelCost?.("summary", null, matched.ruleIds);
        onModelCost?.("summary", 0.12, matched.ruleIds);
        onModelCost?.("embedding", null, ["rule"]);
        throw new Error("failed after dispatch");
      },
    );
    vi.mocked(bufferTopicRuleProcessingCosts).mockRejectedValueOnce(
      new Error("connection lost"),
    );

    await expect(
      processTopicsTrace(matched, { scheduleRetry }),
    ).rejects.toThrow("failed after dispatch");
    const receipts = vi.mocked(bufferTopicRuleProcessingCosts).mock.calls;
    expect(receipts).toHaveLength(2);
    expect(receipts[0]).toEqual(receipts[1]);
    expect(receipts[0][0]).toEqual({
      projectId: event.projectId,
      receiptId: expect.any(String),
      recordedAt: expect.any(Date),
      shares: [
        { ruleId: "rule", cost: 0.06, partial: true },
        { ruleId: secondRule.id, cost: 0.06, partial: false },
      ],
    });

    vi.mocked(summarizeAssembledTrace).mockImplementationOnce(
      async ({ onModelCost }) => {
        onModelCost?.("summary", null, matched.ruleIds);
        onModelCost?.("embedding", 0, [secondRule.id]);
        return { outcome: "summarized", rows: [] };
      },
    );
    await processTopicsTrace(matched, { scheduleRetry, attempt: 1 });
    expect(receipts[2][0].receiptId).not.toBe(receipts[0][0].receiptId);
    expect(receipts[2][0].shares).toEqual([
      { ruleId: "rule", cost: null, partial: true },
      { ruleId: secondRule.id, cost: 0, partial: true },
    ]);
    expect(recordTopicSnapshotProcessingCost).not.toHaveBeenCalled();
  });

  it("finishes a processed live trace while its Redis cost receipt waits for reconnection", async () => {
    const enqueued = Promise.withResolvers<void>();
    const reconnect = Promise.withResolvers<void>();
    vi.mocked(bufferTopicRuleProcessingCosts).mockImplementationOnce(() => {
      enqueued.resolve();
      return reconnect.promise;
    });
    vi.mocked(summarizeAssembledTrace).mockImplementationOnce(
      async ({ onModelCost }) => {
        onModelCost?.("summary", 0.01, ["rule"]);
        return { outcome: "summarized", rows: [] };
      },
    );
    const processed = processTopicsTrace(event, { scheduleRetry });
    try {
      await enqueued.promise;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await Promise.race([processed, "still waiting"])).toEqual({
        outcome: "summarized",
      });
    } finally {
      reconnect.resolve();
      await processed;
    }
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

  it("reads the transcript at the key the job carries", async () => {
    vi.mocked(summarizeAssembledTrace).mockResolvedValue({
      outcome: "summarized",
      rows: [],
    });

    await processTopicsTrace(event, { scheduleRetry });

    expect(mocks.getInputs).toHaveBeenCalledWith("stored.json");
    expect(summarizeAssembledTrace).toHaveBeenCalledOnce();
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
