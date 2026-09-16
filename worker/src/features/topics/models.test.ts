import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { TopicExecution } from "@langfuse/shared/topics";

const state = vi.hoisted(() => ({
  call: vi.fn(),
  reserve: vi.fn(),
  artifacts: new Map<string, unknown>(),
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
  getTopicsArtifactRoot: () => "/unused",
  readTopicArtifact: async (
    _project: string,
    _execution: string,
    key: string,
  ) => state.artifacts.get(key) ?? null,
  writeTopicArtifact: async (
    _project: string,
    _execution: string,
    key: string,
    value: unknown,
  ) => {
    state.artifacts.set(key, value);
  },
}));
vi.mock("./budget", () => ({
  TopicsBudget: class {
    reserve = state.reserve;
    async complete() {}
  },
}));

import { nameTopicGroups, summarizeTopicTrace } from "./models";
import { TopicsProviderUnavailable } from "./provider-error";
import { topicProcessingConfigSchema } from "@langfuse/shared/topics";

const execution = {
  projectId: "project",
  id: "execution",
  input: { budgetUsd: 0.25 },
} as TopicExecution;
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
  state.artifacts.clear();
  state.call.mockReset();
  state.reserve.mockReset();
});

describe("Topics naming boundary", () => {
  it("persists accepted summaries without retaining transcript request bodies", async () => {
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
    await summarizeTopicTrace(
      { execution, key: "summary" },
      facet,
      "RAW_TRANSCRIPT_SENTINEL",
      ["block-a"],
    );
    await summarizeTopicTrace(
      { execution, key: "summary" },
      facet,
      "RAW_TRANSCRIPT_SENTINEL",
      ["block-a"],
    );
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
    expect(JSON.stringify([...state.artifacts.values()])).not.toContain(
      "RAW_TRANSCRIPT_SENTINEL",
    );
    expect(
      [...state.artifacts.keys()].some((key) => key.startsWith("call-")),
    ).toBe(true);
  });
  it("rejects an oversized shared transcript before reserving budget or calling the provider", async () => {
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
      summarizeTopicTrace(
        { execution, key: "oversized" },
        facet,
        "Trace evidence. ".repeat(1000),
        ["block-a"],
      ),
    ).rejects.toThrow("transcript is never shortened per facet");
    expect(state.call).not.toHaveBeenCalled();
    await expect(
      summarizeTopicTrace(
        { execution, key: "oversized" },
        facet,
        "Trace evidence. ".repeat(1000),
        ["block-a"],
      ),
    ).rejects.not.toBeInstanceOf(TopicsProviderUnavailable);
    expect(state.reserve).not.toHaveBeenCalled();
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
      { execution, key: "many-blocks" },
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
  it("attaches the known identity and replays the accepted provider output", async () => {
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Requests involving subscription invoices.",
        evidenceSummaryIds: ["member-a"],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    const result = await nameTopicGroups({ execution, key: "one" }, evidence);
    expect(result.output.labels[0]).toMatchObject({
      id: "stable-topic-id",
      evidenceSummaryIds: ["member-a"],
    });
    await nameTopicGroups({ execution, key: "one" }, evidence);
    expect(state.call).toHaveBeenCalledTimes(1);
    expect(state.call.mock.calls[0][0].model.id).toBe("gpt-5.6-luna");
    expect(result.costUsd).toBeCloseTo(0.000056, 10);
    expect(
      [...state.artifacts.keys()].some((key) => key.startsWith("request-")),
    ).toBe(false);
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
    await nameTopicGroups(
      { execution, key: "all-members" },
      {
        groups: [{ id: "group", members, contrasts: [] }],
      },
    );
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
    await expect(
      nameTopicGroups({ execution, key: "contrast" }, evidence),
    ).rejects.toThrow();
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Invoice requests.",
        evidenceSummaryIds: ["member-a", "member-b", "member-a", "member-b"],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    await expect(
      nameTopicGroups({ execution, key: "too-many" }, evidence),
    ).rejects.toThrow();
    expect(
      [...state.artifacts.keys()].some((key) => key.startsWith("call-")),
    ).toBe(false);
  });
});
