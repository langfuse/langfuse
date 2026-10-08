import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  call: vi.fn(),
  embed: vi.fn(),
  increment: vi.fn(),
}));
vi.mock("@langfuse/shared/src/server", () => ({
  logger: { warn: vi.fn() },
  recordIncrement: state.increment,
}));
vi.mock("@langfuse/shared/topics/server", () => ({
  generateTopicText: (...args: unknown[]) => state.call(...args),
  generateTopicEmbedding: (...args: unknown[]) => state.embed(...args),
}));

import {
  embedTopicSummary,
  nameTopicGroup,
  summarizeTopicTrace,
  summarizeTopicTraceFacets,
} from "./models";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";
import { LLMAdapter } from "@langfuse/shared";
import type { TopicsModel, TopicsModels } from "@langfuse/shared/topics/server";

function slot(slot: TopicsModel["slot"], model: string): TopicsModel {
  return {
    slot,
    provider: "bedrock",
    adapter: LLMAdapter.Bedrock,
    model,
    connection: { secretKey: "encrypted", config: { region: "eu-west-1" } },
  };
}

function topicsModels(summaryModel = "us.openai.gpt-5.6-luna"): TopicsModels {
  return {
    projectId: "project",
    enabled: true,
    summary: slot("summary", summaryModel),
    embedding: {
      ...slot("embedding", "eu.cohere.embed-v4:0"),
      dimensions: 256,
    },
    clustering: slot("clustering", "us.openai.gpt-5.6-terra"),
  };
}

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
});

describe("Topics naming boundary", () => {
  it.each([
    ["us.openai.gpt-5.6-luna", 0.00002, 0.000036],
    ["us.openai.gpt-6-luna", 0.000011, 0.0000165],
    ["global.openai.gpt-6-luna", 0.00001, 0.000015],
  ])(
    "summarizes a trace and prices %s usage",
    async (model, inputCost, outputCost) => {
      state.call.mockResolvedValue({
        output: { summary: "A billing request.", status: "applicable" },
        usage: { inputTokens: 100, outputTokens: 30 },
      });
      const result = await summarizeTopicTrace(
        topicsModels(model),
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
      expect(request.model).toMatchObject({ slot: "summary", model });
      expect(request.system).toEqual([
        { text: expect.stringContaining(facet.prompt), cache: true },
      ]);
      expect(request.input).toBe(
        "<transcript>\nRAW_TRANSCRIPT_SENTINEL\n</transcript>\n\nWrite the summary now, in the facet's format.",
      );
    },
  );

  it("rejects a request frozen on another summary model before calling the provider", async () => {
    await expect(
      summarizeTopicTrace(
        topicsModels("us.openai.gpt-6-luna"),
        facet,
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toMatchObject({ reason: "configuration" });
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
      topicsModels(),
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
        topicsModels(),
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

  it("prices cache reads and writes at their cache rates", async () => {
    state.call.mockResolvedValue({
      output: { summary: "A billing request.", status: "applicable" },
      usage: {
        inputTokens: 4000,
        outputTokens: 300,
        totalTokens: 4300,
        cacheReadTokens: 2840,
        cacheWriteTokens: 100,
      },
    });
    const result = await summarizeTopicTrace(
      topicsModels("us.openai.gpt-6-luna"),
      facet,
      "RAW_TRANSCRIPT_SENTINEL",
      topicProcessingConfigSchema.parse({
        summaryModel: "us.openai.gpt-6-luna",
      }),
    );
    expect(result.usageDetails).toMatchObject({
      summary_input: 4000,
      summary_input_cache_read: 2840,
    });
    expect(result.usageDetails.summary_input_cache_write).toBe(100);
    // 1,060 uncached at $0.11, 2,840 cache reads at $0.011 and 100 cache writes at $0.1375 per million.
    expect(result.costDetails.summary_input).toBeCloseTo(
      (1060 * 0.11 + 2840 * 0.011 + 100 * 0.1375) / 1_000_000,
      12,
    );
  });

  it("summarizes all facets of a trace in one request and checks its size first", async () => {
    state.call.mockResolvedValue({
      output: {
        intent_1: {
          notes: "n",
          summary: "Export sales.",
          status: "applicable",
        },
        issues_2: { notes: "n", summary: "", status: "not_applicable" },
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    const config = topicProcessingConfigSchema.parse({
      summaryModel: "us.openai.gpt-5.6-luna",
    });
    const issues = {
      ...facet,
      facetId: "issues",
      prompt: "Describe the main problem.",
    };
    const facets = [
      { key: "intent_1", facet, builtIn: true },
      { key: "issues_2", facet: issues, builtIn: false },
    ];
    await summarizeTopicTraceFacets(
      topicsModels(),
      facets,
      "RAW_TRANSCRIPT_SENTINEL",
      config,
    );
    expect(state.call).toHaveBeenCalledOnce();
    const request = state.call.mock.calls[0][0];
    // Built-in facets end the first cached prefix, custom facets the second; the transcript is uncached.
    expect(request.system).toEqual([
      {
        text: expect.stringContaining(
          `<facet key="intent_1">\n${facet.prompt}\n</facet>`,
        ),
        cache: true,
      },
      {
        text: `<facet key="issues_2">\n${issues.prompt}\n</facet>`,
        cache: true,
      },
    ]);
    expect(request.system[0].text).not.toContain("issues_2");
    expect(request.input).toContain("RAW_TRANSCRIPT_SENTINEL");
    expect(request.maxOutputTokens).toBe(config.maxOutputTokens * 2);
    // Every facet key is required in the structured output.
    expect(
      request.schema.safeParse({
        intent_1: {
          notes: "n",
          summary: "Export sales.",
          status: "applicable",
        },
      }).success,
    ).toBe(false);

    state.call.mockClear();
    await expect(
      summarizeTopicTraceFacets(
        topicsModels(),
        facets,
        "Trace evidence. ".repeat(1000),
        topicProcessingConfigSchema.parse({
          maxInputTokens: 256,
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toThrow(/above this run's 256-token input limit/);
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
    const result = await nameTopicGroup(topicsModels(), {
      members,
      contrasts: [],
    });
    expect(result.output).toMatchObject({
      name: "Invoice assistance",
      evidenceSummaryIds: [members[399].id],
    });
    expect(state.call).toHaveBeenCalledOnce();
    expect(state.call.mock.calls[0][0].model).toMatchObject({
      slot: "clustering",
      model: "us.openai.gpt-5.6-terra",
    });
    expect(result.costDetails.total).toBeCloseTo(0.03236, 10);
    const submitted = JSON.parse(state.call.mock.calls[0][0].input);
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
      await expect(nameTopicGroup(topicsModels(), evidence)).rejects.toThrow();
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
      embedTopicSummary(topicsModels().embedding, "An invoice request.", 256),
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
        topicsModels().embedding,
        "An invoice request.",
        256,
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
