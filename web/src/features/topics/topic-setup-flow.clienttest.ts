import { expect, it } from "vitest";
import {
  canLeaveTopicQuestions,
  followsTopicRecommendations,
  initialTopicSetupDraft,
  isRecommendedTopicModel,
  pickRecommendedTopicModel,
  setupWaitMinutes,
  topicSetupRun,
  topicSetupStage,
  topicConnectionCaption,
} from "./topic-setup-flow";

const connections = [
  {
    id: "bedrock",
    provider: "Amazon Bedrock",
    adapter: "bedrock",
    customModels: [
      "us.anthropic.claude-haiku-5-5",
      "us.anthropic.claude-sonnet-5-5",
      "us.cohere.embed-v4:0",
    ],
    withDefaultModels: false,
  },
];

it("recommends only the listed models for each job", () => {
  expect(isRecommendedTopicModel("summary", "us.openai.gpt-6-luna")).toBe(true);
  expect(
    isRecommendedTopicModel("summary", "eu.anthropic.claude-haiku-4-5"),
  ).toBe(false);
  expect(isRecommendedTopicModel("summary", "gemini-2.5-pro")).toBe(false);
  expect(isRecommendedTopicModel("embedding", "us.cohere.embed-v4:0")).toBe(
    true,
  );
  expect(
    isRecommendedTopicModel("embedding", "amazon.titan-embed-text-v2:0"),
  ).toBe(false);
  expect(
    isRecommendedTopicModel("clustering", "us.anthropic.claude-sonnet-5-5"),
  ).toBe(true);
  expect(
    isRecommendedTopicModel("clustering", "us.anthropic.claude-opus-5-5"),
  ).toBe(false);
});

it("preselects the highest-ranked recommended model across connections", () => {
  expect(
    pickRecommendedTopicModel("summary", [
      ["Anthropic", ["claude-sonnet-5-5", "claude-haiku-5-5"]],
      ["Amazon Bedrock", ["us.openai.gpt-6-luna"]],
    ]),
  ).toEqual({ provider: "Amazon Bedrock", model: "us.openai.gpt-6-luna" });
  expect(
    pickRecommendedTopicModel("clustering", [
      ["OpenAI", ["gpt-6-sol", "gpt-6.1-sol", "claude-sonnet-5-5"]],
    ]),
  ).toEqual({ provider: "OpenAI", model: "gpt-6.1-sol" });
});

it("starts from recommended models and a 5 minute wait when the project has no topics setup", () => {
  const draft = initialTopicSetupDraft({
    stored: { summary: null, embedding: null, clustering: null },
    connections,
    facets: [],
    enabledFacetIds: null,
    traceIdleMs: null,
  });
  expect(draft.questions.every((question) => question.enabled)).toBe(true);
  expect(
    draft.questions.find((question) => question.name === "Intent")?.description,
  ).toBe("What the run was asked to do.");
  expect(draft.summary?.model).toBe("us.anthropic.claude-haiku-5-5");
  expect(draft.embedding?.model).toBe("us.cohere.embed-v4:0");
  expect(draft.clustering?.model).toBe("us.anthropic.claude-sonnet-5-5");
  expect(draft.waitMinutes).toBe(5);
  expect(followsTopicRecommendations(draft)).toBe(true);
});

it("keeps a stored 10 minute idle time and a stored model", () => {
  expect(setupWaitMinutes(600_000)).toBe(10);
  expect(setupWaitMinutes(90_000)).toBe(5);
  const draft = initialTopicSetupDraft({
    stored: {
      summary: {
        llmApiKeyId: "bedrock",
        model: "eu.anthropic.claude-sonnet-4-5",
      },
      embedding: null,
      clustering: null,
    },
    connections,
    facets: [
      {
        id: "intent",
        name: "Intent",
        description: "Custom intent description.",
        isBuiltIn: true,
      },
    ],
    enabledFacetIds: new Set(["intent"]),
    traceIdleMs: 600_000,
  });
  expect(draft.summary?.model).toBe("eu.anthropic.claude-sonnet-4-5");
  expect(draft.waitMinutes).toBe(10);
  expect(
    draft.questions.find((question) => question.name === "Intent")?.description,
  ).toBe("Custom intent description.");
  expect(
    draft.questions.find((question) => question.name === "Sentiment")?.enabled,
  ).toBe(false);
});

it("requires one question and all three models before the first step can save", () => {
  const model = {
    provider: "Amazon Bedrock",
    model: "eu.anthropic.claude-haiku-4-5",
  };
  expect(
    canLeaveTopicQuestions({
      canWrite: true,
      questions: [
        { enabled: false },
        { enabled: false },
        { enabled: false },
        { enabled: false },
      ],
      summary: model,
      embedding: model,
      clustering: model,
    }),
  ).toBe(false);
  expect(
    canLeaveTopicQuestions({
      canWrite: true,
      questions: [{ enabled: true }],
      summary: model,
      embedding: null,
      clustering: model,
    }),
  ).toBe(false);
});

it("follows a setup run from summaries through its topic update", () => {
  const now = Date.parse("2026-10-22T08:00:00Z");
  const process = (status: string, updatedAt = now) => ({
    id: "setup",
    status,
    phase: status,
    updatedAt: new Date(updatedAt).toISOString(),
    input: {
      operation: "process" as const,
      requestId: "r",
      thenUpdate: { timeRange: {} },
    },
  });
  const update = (status: string, phase = status) => ({
    id: "topics",
    status,
    phase,
    updatedAt: new Date(now).toISOString(),
    input: { operation: "update" as const, requestId: "setup-topics" },
  });
  const stage = (executions: Parameters<typeof topicSetupRun>[0]) =>
    topicSetupStage(topicSetupRun(executions)!, now);
  expect(topicSetupRun([update("completed")])).toBeNull();
  expect(stage([process("running")]).stage).toBe("summarizing");
  expect(stage([process("completed")]).stage).toBe("grouping");
  expect(stage([process("completed", now - 5 * 60_000)])).toEqual({
    stage: "failed",
    retryId: null,
  });
  expect(
    stage([update("running", "clustering"), process("completed")]).stage,
  ).toBe("grouping");
  expect(stage([update("running", "naming"), process("completed")]).stage).toBe(
    "naming",
  );
  expect(
    stage([update("completed"), process("completed_with_errors")]),
  ).toEqual({ stage: "done", retryId: null });
  expect(stage([process("failed")])).toEqual({
    stage: "failed",
    retryId: "setup",
  });
  expect(stage([update("failed"), process("completed")])).toEqual({
    stage: "failed",
    retryId: "topics",
  });
});

it("names the connection when the project has one provider", () => {
  expect(topicConnectionCaption(connections)).toBe("Amazon Bedrock");
  expect(topicConnectionCaption([])).toBe("No AI connection");
});
