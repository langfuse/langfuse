import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
vi.mock("@langfuse/shared/topics/server", () => ({
  countTopicTokens: (text: string) => Math.ceil(text.length / 4),
}));

import { nameTopicGroups, summarizeTopicTrace } from "./models";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";

const evidence = {
  groups: [
    {
      id: "stable-topic-id",
      members: [
        { id: "member-a", summary: "The user requests an invoice." },
        { id: "member-b", summary: "The user requests billing corrections." },
      ],
      contrasts: [
        { id: "contrast", summary: "The user requests translation." },
      ],
    },
  ],
};

beforeEach(() => {
  state.call.mockReset();
});

describe("Topics naming boundary", () => {
  it("validates summary evidence at the provider boundary", async () => {
    state.call.mockResolvedValue({
      output: {
        summary: "A billing request.",
        evidenceBlockIds: ["block-a"],
        status: "applicable",
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    const facet = {
      id: "facet-version",
      projectId: "project",
      facetId: "facet",
      version: 1,
      prompt: "Describe the user's request.",
      processingConfig: topicProcessingConfigSchema.parse({}),
      createdAt: "2026-09-16T00:00:00Z",
    };
    await summarizeTopicTrace(facet, "RAW_TRANSCRIPT_SENTINEL", ["block-a"]);
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call.mock.calls[0][0].model.id).toBe("gpt-4.1-nano");
    const providerSchema = state.call.mock.calls[0][0].output;
    expect(
      providerSchema.safeParse({
        summary: "A billing request.",
        evidenceBlockIds: ["invented-block"],
        status: "applicable",
      }).success,
    ).toBe(false);
    expect(
      providerSchema.safeParse({
        summary: "A billing request.",
        evidenceBlockIds: ["block-a"],
        status: "applicable",
      }).success,
    ).toBe(true);
  });
  it("rejects an oversized shared transcript before calling the provider", async () => {
    const facet = {
      id: "facet-version",
      projectId: "project",
      facetId: "facet",
      version: 1,
      prompt: "Describe intent.",
      processingConfig: topicProcessingConfigSchema.parse({
        maxInputTokens: 256,
      }),
      createdAt: "2026-09-16T00:00:00Z",
    };
    await expect(
      summarizeTopicTrace(facet, "Trace evidence. ".repeat(1000), ["block-a"]),
    ).rejects.toThrow("transcript is never shortened per facet");
    expect(state.call).not.toHaveBeenCalled();
  });

  it("keeps the summary provider schema bounded for traces with many evidence blocks", async () => {
    const blockIds = Array.from({ length: 400 }, (_, index) =>
      String(index).padStart(48, "0"),
    );
    state.call.mockResolvedValue({
      output: {
        summary: "A billing request.",
        evidenceBlockIds: [blockIds[0]],
        status: "applicable",
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    await summarizeTopicTrace(
      {
        id: "facet-version",
        projectId: "project",
        facetId: "facet",
        version: 1,
        prompt: "Describe intent.",
        processingConfig: topicProcessingConfigSchema.parse({}),
        createdAt: "2026-09-16T00:00:00Z",
      },
      "Trace evidence.",
      blockIds,
    );
    const outputSchema = z.toJSONSchema(state.call.mock.calls[0][0].output);
    const enumValues =
      outputSchema.properties?.evidenceBlockIds?.items?.enum ?? [];
    expect(enumValues.join("").length).toBeLessThanOrEqual(15_000);
  });
  it("attaches the known group identity to its provider label", async () => {
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Requests involving subscription invoices.",
        evidenceSummaryIds: ["member-a"],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    const result = await nameTopicGroups(evidence);
    expect(result.output.labels[0]).toMatchObject({
      id: "stable-topic-id",
      evidenceSummaryIds: ["member-a"],
    });
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call.mock.calls[0][0].model.id).toBe("gpt-5.6-luna");
    expect(result.costUsd).toBeCloseTo(0.000056, 10);
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
    await nameTopicGroups({
      groups: [{ id: "group", members, contrasts: [] }],
    });
    const submitted = JSON.parse(
      state.call.mock.calls[0][0].messages[1].content,
    );
    expect(submitted.members).toEqual(members);
    const outputSchema = z.toJSONSchema(state.call.mock.calls[0][0].output);
    const enumValues =
      outputSchema.properties?.evidenceSummaryIds?.items?.enum ?? [];
    expect(enumValues.join("").length).toBeLessThanOrEqual(15_000);
  });

  it("rejects contrast evidence and excess evidence before accepting a name", async () => {
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Invoice requests.",
        evidenceSummaryIds: ["contrast"],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    await expect(nameTopicGroups(evidence)).rejects.toThrow();
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Invoice requests.",
        evidenceSummaryIds: ["member-a", "member-b", "member-a", "member-b"],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    await expect(nameTopicGroups(evidence)).rejects.toThrow();
  });
});
