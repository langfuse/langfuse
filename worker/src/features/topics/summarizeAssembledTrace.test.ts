import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transcript } from "@langfuse/shared/src/server";
import type { TopicFacet } from "@langfuse/shared/topics";

const state = vi.hoisted(() => ({
  enabled: true,
  facets: vi.fn(),
  stored: vi.fn(),
  write: vi.fn(),
  summarize: vi.fn(),
  embed: vi.fn(),
}));

vi.mock("@langfuse/shared/topics/server", () => ({
  isTopicsProjectEnabled: () => state.enabled,
  getTopicsModelConfig: () => ({
    summaryModel: "global.openai.gpt-5.6-luna",
    embeddingModel: "cohere.embed-v4:0",
  }),
  ensureDefaultTopicFacets: (...args: unknown[]) => state.facets(...args),
  listTopicSummaries: (...args: unknown[]) => state.stored(...args),
  writeTopicSummaries: (...args: unknown[]) => state.write(...args),
  TOPICS_TRANSCRIPT_VERSION: "shared-transcript-v2",
}));
vi.mock("./models", () => ({
  summarizeTopicTrace: (...args: unknown[]) => state.summarize(...args),
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
  state.enabled = true;
  state.facets.mockReset();
  state.stored.mockReset();
  state.write.mockReset();
  state.summarize.mockReset();
  state.embed.mockReset();
  state.facets.mockResolvedValue([facet]);
  state.stored.mockResolvedValue([]);
  state.write.mockResolvedValue(undefined);
  state.summarize.mockResolvedValue({
    output: { summary: "Export monthly sales.", status: "applicable" },
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
  it("leaves other projects untouched", async () => {
    state.enabled = false;
    await summarizeAssembledTrace({
      projectId: "project-b",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T12:00:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
    });
    expect(state.facets).not.toHaveBeenCalled();
    expect(state.summarize).not.toHaveBeenCalled();
    expect(state.write).not.toHaveBeenCalled();
  });

  it("summarizes the assembled transcript once per current facet and skips a finished retry", async () => {
    await summarizeAssembledTrace({
      projectId: "project-a",
      traceId: "trace-1",
      traceTimestamp: "2026-09-22T12:00:00.000Z",
      environment: "default",
      traceName: "agent-turn",
      transcript,
    });
    expect(state.facets).toHaveBeenCalledWith("project-a");
    expect(state.summarize).toHaveBeenCalledTimes(1);
    const submitted = state.summarize.mock.calls[0];
    expect(submitted[0].prompt).toBe(facet.versions[0].prompt);
    expect(submitted[1]).toContain("Export monthly sales");
    expect(submitted[1]).not.toContain("observation");
    const written = state.write.mock.calls[0][0][0];
    expect(written).toMatchObject({
      projectId: "project-a",
      traceId: "trace-1",
      sessionId: null,
      facetId: "facet-1",
      facetVersion: 2,
      state: "complete",
      summary: "Export monthly sales.",
      summaryModel: "global.openai.gpt-5.6-luna",
      embeddingModel: "cohere.embed-v4:0",
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
    });
    expect(state.summarize).toHaveBeenCalledOnce();
    expect(state.write.mock.calls[0][0][0].unitStartTime).toBe(
      "2026-09-22T11:59:00.000Z",
    );
  });

  it("propagates a provider failure for the trace outcome", async () => {
    state.summarize.mockRejectedValue(new Error("provider unavailable"));
    await expect(
      summarizeAssembledTrace({
        projectId: "project-a",
        traceId: "trace-1",
        traceTimestamp: "2026-09-22T12:00:00.000Z",
        environment: "default",
        traceName: "agent-turn",
        transcript,
      }),
    ).rejects.toThrow("provider unavailable");
    expect(state.write).not.toHaveBeenCalled();
  });
});
