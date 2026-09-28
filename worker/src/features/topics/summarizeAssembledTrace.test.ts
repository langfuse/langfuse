import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Transcript } from "@langfuse/shared/src/server";

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
  ensureDefaultTopicFacets: (...args: unknown[]) => state.facets(...args),
  listTopicSummaries: (...args: unknown[]) => state.stored(...args),
  writeTopicSummaries: (...args: unknown[]) => state.write(...args),
  TOPICS_TRANSCRIPT_VERSION: "shared-transcript-v1",
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
        observations: [],
        messages: [
          {
            observationId: "observation",
            traceId: "trace-1",
            role: "user",
            source: "input",
            parts: [{ type: "text", text: "Export monthly sales" }],
          },
        ],
      },
    },
  ],
};

const facet = {
  id: "facet-1",
  projectId: "project-a",
  name: "Intent",
  description: "The task requested for this run.",
  publishedRunId: null,
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

const issues = {
  ...facet,
  id: "facet-2",
  name: "Issues",
  versions: [
    {
      ...facet.versions[0],
      facetId: "facet-2",
      version: 1,
      prompt: "Describe the most consequential problem.",
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
  state.facets.mockResolvedValue([facet, issues]);
  state.stored.mockResolvedValue([]);
  state.write.mockResolvedValue(undefined);
  state.summarize.mockResolvedValue({
    output: {
      intent_1: {
        notes: "User asks for a sales export.",
        summary: "Export monthly sales.",
        status: "applicable",
      },
      issues_2: {
        notes: "No error shown.",
        summary: "",
        status: "not_applicable",
      },
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

  it("summarizes all current facets in one call, records usage once and skips a finished retry", async () => {
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
    const [keyed, text] = state.summarize.mock.calls[0];
    expect(keyed.map(({ key }: { key: string }) => key)).toEqual([
      "intent_1",
      "issues_2",
    ]);
    expect(text).toContain("Export monthly sales");
    expect(text).not.toContain("observation");
    const [intent, issue] = state.write.mock.calls[0][0];
    expect(intent).toMatchObject({
      traceId: "trace-1",
      facetId: "facet-1",
      facetVersion: 2,
      state: "complete",
      summary: "Export monthly sales.",
      usageDetails: { summary_input: 20, embedding_input: 4 },
    });
    expect(issue).toMatchObject({
      facetId: "facet-2",
      state: "not_applicable",
      summary: "",
      usageDetails: {},
    });
    state.stored.mockResolvedValue([intent]);
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
  });

  it("propagates a provider failure so the batch job can retry", async () => {
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
