import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  recordDistribution,
  recordIncrement,
  type Transcript,
} from "@langfuse/shared/src/server";
import type { TopicFacet } from "@langfuse/shared/topics";
import type { TopicsModels } from "@langfuse/shared/topics/server";

const state = vi.hoisted(() => ({
  facets: vi.fn(),
  stored: vi.fn(),
  write: vi.fn(),
  summarize: vi.fn(),
  embed: vi.fn(),
  setAttribute: vi.fn(),
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  listTopicSummaries: (...args: unknown[]) => state.stored(...args),
  writeTopicSummaries: (...args: unknown[]) => state.write(...args),
  TOPICS_TRANSCRIPT_VERSION: "shared-transcript-v2",
}));
vi.mock("@langfuse/shared/src/server", () => ({
  recordDistribution: vi.fn(),
  recordIncrement: vi.fn(),
  instrumentAsync: async (
    _options: unknown,
    action: (span: {
      setAttributes: () => void;
      setAttribute: typeof state.setAttribute;
    }) => Promise<unknown>,
  ) => action({ setAttributes: vi.fn(), setAttribute: state.setAttribute }),
}));
vi.mock("./models", () => ({
  summarizeTopicTraceFacets: (...args: unknown[]) => state.summarize(...args),
  embedTopicSummary: (...args: unknown[]) => state.embed(...args),
}));

import { summarizeAssembledTrace } from "./summarizeAssembledTrace";

const transcript: Transcript = {
  threads: [
    {
      conversationHistory: [],
      currentTurn: {
        nestingLevel: 0,
        observations: [],
        messages: [
          {
            observationId: "observation",
            traceId: "trace-1",
            startTime: new Date("2026-09-22T12:00:00.000Z"),
            endTime: new Date("2026-09-22T12:00:01.000Z"),
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Export monthly sales" }],
          },
        ],
      },
    },
  ],
};

const facet: TopicFacet = {
  id: "facet-1",
  projectId: "project-a",
  name: "Intent",
  description: "The task requested for this run.",
  isBuiltIn: true,
  versions: [
    {
      projectId: "project-a",
      facetId: "facet-1",
      version: 2,
      prompt: "Describe only what this run was asked to accomplish.",
      createdAt: "2026-09-16T00:00:00.000Z",
    },
  ],
};

const slot = (name: "summary" | "embedding" | "clustering", model: string) => ({
  slot: name,
  provider: "bedrock",
  adapter: "bedrock",
  model,
  connection: { secretKey: "encrypted" },
});
const models = {
  projectId: "project-a",
  enabled: true,
  summary: slot("summary", "us.openai.gpt-5.6-luna"),
  embedding: { ...slot("embedding", "eu.cohere.embed-v4:0"), dimensions: 1024 },
  clustering: slot("clustering", "us.openai.gpt-5.6-terra"),
} as TopicsModels;

const usage = {
  providedUsageDetails: { summary_input: 20 },
  usageDetails: { summary_input: 20, summary_output: 8, total: 28 },
  providedCostDetails: {},
  costDetails: {
    summary_input: 0.000004,
    summary_output: 0.00001,
    total: 0.000014,
  },
};

beforeEach(() => {
  vi.mocked(recordDistribution).mockClear();
  vi.mocked(recordIncrement).mockClear();
  state.facets.mockReset();
  state.stored.mockReset();
  state.write.mockReset();
  state.summarize.mockReset();
  state.embed.mockReset();
  state.setAttribute.mockClear();
  state.facets.mockReturnValue([facet]);
  state.stored.mockResolvedValue([]);
  state.write.mockResolvedValue(undefined);
  state.summarize.mockResolvedValue({
    output: {
      intent_1: { summary: "Export monthly sales.", status: "applicable" },
    },
    ...usage,
  });
  state.embed.mockResolvedValue({
    embedding: [0.25],
    providedUsageDetails: { embedding_input: 4 },
    usageDetails: { embedding_input: 4, total: 4 },
    providedCostDetails: {},
    costDetails: { embedding_input: 0.00000048, total: 0.00000048 },
  });
});

describe("summarizeAssembledTrace", () => {
  it("summarizes the assembled transcript once per current facet and skips a finished retry", async () => {
    await summarizeAssembledTrace({
      projectId: "project-a",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T12:00:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
      models,
      facets: state.facets(),
    });
    expect(state.summarize).toHaveBeenCalledTimes(1);
    const submitted = state.summarize.mock.calls[0];
    expect(submitted[0]).toBe(models);
    expect(submitted[1]).toEqual([
      { key: "intent_1", facet: facet.versions[0] },
    ]);
    expect(submitted[2]).toContain("Export monthly sales");
    expect(submitted[2]).not.toContain("observation");
    const written = state.write.mock.calls[0][0][0];
    expect(written).toMatchObject({
      projectId: "project-a",
      traceId: "trace-1",
      sessionId: null,
      facetId: "facet-1",
      facetVersion: 2,
      state: "complete",
      summary: "Export monthly sales.",
      summaryModel: "us.openai.gpt-5.6-luna",
      embeddingModel: "eu.cohere.embed-v4:0",
      environment: "default",
      traceName: "agent-turn",
      providedUsageDetails: {
        summary_input: 20,
        embedding_input: 4,
        total: 24,
      },
      usageDetails: {
        summary_input: 20,
        summary_output: 8,
        embedding_input: 4,
        total: 32,
      },
    });
    expect(written.costDetails.total).toBeCloseTo(0.00001448, 12);
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.topics.stage_duration_ms",
      expect.any(Number),
      { stage: "trace", outcome: "success", unit: "milliseconds" },
    );
    state.stored.mockImplementation(async (_projectId, _filter, timeRange) =>
      new Date(written.unitStartTime) >= timeRange.from &&
      new Date(written.unitStartTime) < timeRange.to
        ? [written]
        : [],
    );
    state.summarize.mockClear();
    state.write.mockClear();
    await summarizeAssembledTrace({
      projectId: "project-a",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T12:00:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
      models,
      facets: state.facets(),
    });
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    await summarizeAssembledTrace({
      projectId: "project-a",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T11:59:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
      models,
      facets: state.facets(),
    });
    expect(state.summarize).toHaveBeenCalledOnce();
    expect(state.write.mock.calls[0][0][0].unitStartTime).toBe(
      "2026-09-22T11:59:00.000Z",
    );
  });

  it("summarizes all pending facets in one call and records its usage once", async () => {
    const issues: TopicFacet = {
      ...facet,
      id: "facet-2",
      name: "Issues",
      versions: [{ ...facet.versions[0], facetId: "facet-2", version: 1 }],
    };
    state.facets.mockReturnValue([facet, issues]);
    state.summarize.mockResolvedValue({
      output: {
        intent_1: { summary: "Export monthly sales.", status: "applicable" },
        issues_2: { summary: "", status: "not_applicable" },
      },
      ...usage,
    });
    await summarizeAssembledTrace({
      projectId: "project-a",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T12:00:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
      models,
      facets: state.facets(),
    });
    expect(state.summarize).toHaveBeenCalledOnce();
    const [intent, issue] = state.write.mock.calls[0][0];
    expect(intent).toMatchObject({ facetId: "facet-1", state: "complete" });
    expect(intent.usageDetails.summary_input).toBe(20);
    expect(issue).toMatchObject({
      facetId: "facet-2",
      state: "not_applicable",
      usageDetails: {},
    });
  });

  it("keeps the other facets when one facet's output is invalid", async () => {
    const issues: TopicFacet = {
      ...facet,
      id: "facet-2",
      name: "Issues",
      versions: [{ ...facet.versions[0], facetId: "facet-2", version: 1 }],
    };
    state.facets.mockReturnValue([facet, issues]);
    state.summarize.mockResolvedValue({
      output: {
        intent_1: { summary: "", status: "applicable" },
        issues_2: { summary: "Retried a failed export.", status: "applicable" },
      },
      ...usage,
    });
    await expect(
      summarizeAssembledTrace({
        projectId: "project-a",
        traceId: "trace-1",
        traceTimestamp: "2026-09-22T12:00:00.000Z",
        environment: "default",
        traceName: "agent-turn",
        transcript,
        models,
        facets: state.facets(),
      }),
    ).rejects.toThrow(
      "Applicable facet summary must contain a concise summary.",
    );
    const written = state.write.mock.calls[0][0];
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ facetId: "facet-2", state: "complete" });
    // The shared call's usage moves to the first row that is written.
    expect(written[0].usageDetails.summary_input).toBe(20);
    expect(written[0]).not.toHaveProperty("output");
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.topics.stage_duration_ms",
      expect.any(Number),
      { stage: "summary", outcome: "failed", unit: "milliseconds" },
    );
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(([name]) => name === "langfuse.topics.errors"),
    ).toEqual([
      [
        "langfuse.topics.errors",
        1,
        { stage: "summary", reason: "invalid_output" },
      ],
    ]);
    expect(state.setAttribute).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcome",
      "failed",
    );
  });

  it("persists successful facets and attributes an embedding failure once", async () => {
    state.facets.mockReturnValue([
      facet,
      {
        ...facet,
        id: "facet-2",
        name: "Issues",
        versions: [{ ...facet.versions[0], facetId: "facet-2", version: 1 }],
      },
    ]);
    state.summarize.mockResolvedValue({
      output: {
        intent_1: { summary: "Export monthly sales.", status: "applicable" },
        issues_2: { summary: "", status: "not_applicable" },
      },
      ...usage,
    });
    const error = new Error("embedding provider unavailable");
    state.embed.mockRejectedValueOnce(error);
    await expect(
      summarizeAssembledTrace({
        projectId: "project-a",
        traceId: "trace-1",
        traceTimestamp: "2026-09-22T12:00:00.000Z",
        environment: "default",
        traceName: "agent-turn",
        transcript,
        models,
        facets: state.facets(),
      }),
    ).rejects.toBe(error);
    expect(state.summarize).toHaveBeenCalledOnce();
    expect(state.write).toHaveBeenCalledOnce();
    expect(state.write.mock.calls[0][0]).toEqual([
      expect.objectContaining({
        facetId: "facet-2",
        state: "not_applicable",
        usageDetails: usage.usageDetails,
      }),
    ]);
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(([name]) => name === "langfuse.topics.errors"),
    ).toEqual([
      ["langfuse.topics.errors", 1, { stage: "embedding", reason: "unknown" }],
    ]);
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.topics.stage_duration_ms",
      expect.any(Number),
      { stage: "embedding", outcome: "failed", unit: "milliseconds" },
    );
    expect(state.setAttribute).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcome",
      "failed",
    );
  });

  it("propagates a provider failure for the trace outcome", async () => {
    const error = new Error("provider unavailable");
    state.summarize.mockRejectedValue(error);
    await expect(
      summarizeAssembledTrace({
        projectId: "project-a",
        traceId: "trace-1",
        traceTimestamp: "2026-09-22T12:00:00.000Z",
        environment: "default",
        traceName: "agent-turn",
        transcript,
        models,
        facets: state.facets(),
      }),
    ).rejects.toBe(error);
    expect(state.setAttribute).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcome",
      "failed",
    );
    expect(state.write).not.toHaveBeenCalled();
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.topics.stage_duration_ms",
      expect.any(Number),
      { stage: "trace", outcome: "failed", unit: "milliseconds" },
    );
    // Nested stages report one error, attributed to the failing call.
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(([name]) => name === "langfuse.topics.errors"),
    ).toEqual([
      ["langfuse.topics.errors", 1, { stage: "summary", reason: "unknown" }],
    ]);
  });

  it("attributes invalid summary output to the failed summary stage", async () => {
    state.summarize.mockResolvedValue({
      output: { intent_1: { summary: "  ", status: "applicable" } },
      ...usage,
    });
    await expect(
      summarizeAssembledTrace({
        projectId: "project-a",
        traceId: "trace-1",
        traceTimestamp: "2026-09-22T12:00:00.000Z",
        environment: "default",
        traceName: "agent-turn",
        transcript,
        models,
        facets: state.facets(),
      }),
    ).rejects.toMatchObject({ reason: "invalid_output" });
    expect(state.embed).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
    expect(recordDistribution).toHaveBeenCalledWith(
      "langfuse.topics.stage_duration_ms",
      expect.any(Number),
      { stage: "summary", outcome: "failed", unit: "milliseconds" },
    );
    expect(
      vi
        .mocked(recordIncrement)
        .mock.calls.filter(([name]) => name === "langfuse.topics.errors"),
    ).toEqual([
      [
        "langfuse.topics.errors",
        1,
        { stage: "summary", reason: "invalid_output" },
      ],
    ]);
    expect(state.setAttribute).toHaveBeenCalledWith(
      "langfuse.topics.trace_outcome",
      "failed",
    );
  });
});
