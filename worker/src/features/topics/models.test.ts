import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  call: vi.fn(),
  embed: vi.fn(),
  increment: vi.fn(),
  region: vi.fn(),
  summaryModel: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", () => ({
  getLangfuseAIAwsProfile: () => "ai-test",
  getLangfuseAIBedrockRegion: () => state.region(),
  logger: { warn: vi.fn() },
  recordIncrement: state.increment,
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  getTopicsModelConfig: () => ({
    summaryModel: state.summaryModel(),
    embeddingModel: "eu.cohere.embed-v4:0",
  }),
  generateTopicText: (...args: unknown[]) => state.call(...args),
  generateTopicEmbedding: (...args: unknown[]) => state.embed(...args),
}));

import {
  embedTopicSummary,
  nameTopicGroup,
  summarizeTopicTrace,
} from "./models";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";

const facet = {
  projectId: "project",
  facetId: "facet",
  version: 1,
  prompt: "Describe the user's request.",
  createdAt: "2026-09-16T00:00:00Z",
};

const evidence = {
  members: [
    { id: "member-a", summary: "The user requests an invoice." },
    { id: "member-b", summary: "The user requests billing corrections." },
  ],
  contrasts: [{ id: "contrast", summary: "The user requests translation." }],
};

beforeEach(() => {
  state.call.mockReset();
  state.embed.mockReset();
  state.increment.mockReset();
  state.region.mockReset().mockReturnValue("eu-west-1");
  state.summaryModel.mockReset().mockReturnValue("us.openai.gpt-5.6-luna");
});

describe("Topics naming boundary", () => {
  it.each([
    ["us.openai.gpt-5.6-luna", 0.00002, 0.000036],
    ["us.openai.gpt-6-luna", 0.000011, 0.0000165],
    ["global.openai.gpt-6-luna", 0.00001, 0.000015],
  ])(
    "summarizes a trace and prices %s usage",
    async (model, inputCost, outputCost) => {
      state.summaryModel.mockReturnValue(model);
      state.call.mockResolvedValue({
        output: { summary: "A billing request.", status: "applicable" },
        usage: { inputTokens: 100, outputTokens: 30 },
      });
      const result = await summarizeTopicTrace(
        facet,
        "RAW_TRANSCRIPT_SENTINEL",
        topicProcessingConfigSchema.parse({
          summaryModel: model,
        }),
      );
      expect(result.output).toEqual({
        summary: "A billing request.",
        status: "applicable",
      });
      expect(result.providedUsageDetails).toEqual({
        summary_input: 100,
        summary_output: 30,
      });
      expect(result.usageDetails).toEqual({
        summary_input: 100,
        summary_output: 30,
        total: 130,
      });
      expect(result.providedCostDetails).toEqual({});
      expect(result.costDetails.summary_input).toBeCloseTo(inputCost, 10);
      expect(result.costDetails.summary_output).toBeCloseTo(outputCost, 10);
      expect(result.costDetails.total).toBeCloseTo(inputCost + outputCost, 10);
      const request = state.call.mock.calls[0][0];
      expect(request).toMatchObject({
        model,
        region: "eu-west-1",
        profile: "ai-test",
      });
      expect(request.messages[0].content).toContain(facet.prompt);
      expect(request.messages[1].content).toBe("RAW_TRANSCRIPT_SENTINEL");
    },
  );

  it("rejects missing Bedrock configuration before calling the provider", async () => {
    state.region.mockReturnValue(undefined);
    await expect(
      summarizeTopicTrace(
        facet,
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toMatchObject({ reason: "authentication" });
    expect(state.call).not.toHaveBeenCalled();
  });

  it("keeps fallback token counts out of provider-reported usage", async () => {
    state.call.mockResolvedValue({
      output: { summary: "A billing request.", status: "applicable" },
      usage: { inputTokens: 100 },
    });
    const config = topicProcessingConfigSchema.parse({
      summaryModel: "us.openai.gpt-5.6-luna",
    });
    const result = await summarizeTopicTrace(
      facet,
      "A request for an invoice.",
      config,
    );
    expect(result.providedUsageDetails).toEqual({ summary_input: 100 });
    expect(state.increment.mock.calls).toEqual([
      ["langfuse.topics.tokens", 100, { stage: "summary", direction: "input" }],
      [
        "langfuse.topics.token_usage_missing",
        1,
        { stage: "summary", direction: "output" },
      ],
    ]);
    expect(result.usageDetails).toEqual({
      summary_input: 100,
      summary_output: config.maxOutputTokens,
      total: 100 + config.maxOutputTokens,
    });
  });
  it("rejects an oversized shared transcript before calling the provider", async () => {
    await expect(
      summarizeTopicTrace(
        facet,
        "Trace evidence. ".repeat(1000),
        topicProcessingConfigSchema.parse({
          maxInputTokens: 256,
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toThrow(
      /are \d+ tokens, above this run's 256-token input limit\. No model call was made; the transcript is never shortened per facet\./,
    );
    expect(state.call).not.toHaveBeenCalled();
  });

  it("names the complete cohort without shortening member summaries", async () => {
    const members = Array.from({ length: 400 }, (_, index) => ({
      id: String(index).padStart(48, "0"),
      summary: `Request ${index}: ${"Invoice request details. ".repeat(60)} END-${index}`,
    }));
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Requests involving invoices.",
        evidenceSummaryIds: [members[399].id],
      },
      usage: { inputTokens: 16000, outputTokens: 30 },
    });
    const result = await nameTopicGroup({ members, contrasts: [] });
    expect(result.output).toMatchObject({
      name: "Invoice assistance",
      evidenceSummaryIds: [members[399].id],
    });
    expect(state.call).toHaveBeenCalledOnce();
    expect(state.call.mock.calls[0][0].model).toBe("us.openai.gpt-5.6-terra");
    expect(result.costDetails.total).toBeCloseTo(0.03236, 10);
    const submitted = JSON.parse(
      state.call.mock.calls[0][0].messages[1].content,
    );
    expect(submitted.members).toEqual(members);
  });

  it.each([["contrast"], ["member-a", "member-b", "member-a", "member-b"]])(
    "rejects contrast or excess evidence: %j",
    async (...evidenceSummaryIds) => {
      state.call.mockResolvedValue({
        output: {
          name: "Invoice assistance",
          description: "Invoice requests.",
          evidenceSummaryIds,
        },
        usage: { inputTokens: 100, outputTokens: 30 },
      });
      await expect(nameTopicGroup(evidence)).rejects.toThrow();
      // Provider work is billable even when local output validation rejects it.
      expect(state.increment.mock.calls).toEqual([
        [
          "langfuse.topics.tokens",
          100,
          { stage: "naming", direction: "input" },
        ],
        [
          "langfuse.topics.tokens",
          30,
          { stage: "naming", direction: "output" },
        ],
      ]);
    },
  );

  it("records embedding input usage even when the returned vector is invalid", async () => {
    state.embed.mockResolvedValue({ embedding: [], tokens: 12 });
    await expect(
      embedTopicSummary("An invoice request.", 256, "eu.cohere.embed-v4:0"),
    ).rejects.toMatchObject({
      reason: "invalid_output",
    });
    expect(state.increment.mock.calls).toEqual([
      [
        "langfuse.topics.tokens",
        12,
        { stage: "embedding", direction: "input" },
      ],
    ]);
  });

  it.each([undefined, -1, Number.NaN])(
    "does not invent missing embedding usage: %s",
    async (tokens) => {
      state.embed.mockResolvedValue({
        embedding: Array(256).fill(0.25),
        tokens,
      });
      await embedTopicSummary(
        "An invoice request.",
        256,
        "eu.cohere.embed-v4:0",
      );
      expect(state.increment.mock.calls).toEqual([
        [
          "langfuse.topics.token_usage_missing",
          1,
          { stage: "embedding", direction: "input" },
        ],
      ]);
    },
  );
});
