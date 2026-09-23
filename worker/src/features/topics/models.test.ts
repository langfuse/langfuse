import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  call: vi.fn(),
}));
vi.mock("../../env", () => ({
  env: { OPENAI_API_KEY: "unit-test-placeholder" },
}));
vi.mock("@langfuse/shared/encryption", () => ({
  encrypt: () => "encrypted-test-placeholder",
}));
vi.mock("@langfuse/shared/src/server", () => ({
  LLMAdapter: { OpenAI: "openai" },
  createLLMOutput: (schema: unknown) => schema,
  generateLLMText: (...args: unknown[]) => state.call(...args),
}));

import { nameTopicGroup, summarizeTopicTrace } from "./models";
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
});

describe("Topics naming boundary", () => {
  it("summarizes a trace for its facet without requiring citations", async () => {
    state.call.mockResolvedValue({
      output: { summary: "A billing request.", status: "applicable" },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    const result = await summarizeTopicTrace(
      facet,
      "RAW_TRANSCRIPT_SENTINEL",
      topicProcessingConfigSchema.parse({}),
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
    expect(result.costDetails.summary_input).toBeCloseTo(0.00001, 10);
    expect(result.costDetails.summary_output).toBeCloseTo(0.000012, 10);
    expect(result.costDetails.total).toBeCloseTo(0.000022, 10);
    const request = state.call.mock.calls[0][0];
    expect(request.model.id).toBe("gpt-4.1-nano");
    expect(request.messages[0].content).toContain(facet.prompt);
    expect(request.messages[1].content).toBe("RAW_TRANSCRIPT_SENTINEL");
  });

  it("keeps fallback token counts out of provider-reported usage", async () => {
    state.call.mockResolvedValue({
      output: { summary: "A billing request.", status: "applicable" },
      usage: { inputTokens: 100 },
    });
    const config = topicProcessingConfigSchema.parse({});
    const result = await summarizeTopicTrace(
      facet,
      "A request for an invoice.",
      config,
    );
    expect(result.providedUsageDetails).toEqual({ summary_input: 100 });
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
        topicProcessingConfigSchema.parse({ maxInputTokens: 256 }),
      ),
    ).rejects.toThrow("transcript is never shortened per facet");
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
    expect(state.call.mock.calls[0][0].model.id).toBe("gpt-5.6-luna");
    expect(result.costDetails.total).toBeCloseTo(0.003236, 10);
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
    },
  );
});
