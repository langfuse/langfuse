import { expect, it } from "vitest";
import {
  canLeaveTopicQuestions,
  firstTopicsEstimate,
  followsTopicRecommendations,
  initialTopicSetupDraft,
  isRecommendedTopicModel,
  pastBatchLimit,
  pastBatchNotice,
  pickRecommendedTopicModel,
  setupWaitMinutes,
  summaryRunProgress,
  topicConnectionCaption,
} from "./topic-setup-flow";

const connections = [
  {
    id: "bedrock",
    provider: "Amazon Bedrock",
    adapter: "bedrock",
    customModels: [
      "eu.anthropic.claude-haiku-4-5",
      "eu.anthropic.claude-sonnet-4-5",
      "cohere.embed-english-v3",
    ],
    withDefaultModels: false,
  },
];

it("marks a fast text model, an embedding model, and a stronger text model as recommended", () => {
  expect(
    isRecommendedTopicModel("summary", "eu.anthropic.claude-haiku-4-5"),
  ).toBe(true);
  expect(
    isRecommendedTopicModel("summary", "eu.anthropic.claude-sonnet-4-5"),
  ).toBe(false);
  expect(isRecommendedTopicModel("embedding", "cohere.embed-english-v3")).toBe(
    true,
  );
  expect(
    isRecommendedTopicModel("clustering", "eu.anthropic.claude-haiku-4-5"),
  ).toBe(false);
  expect(
    isRecommendedTopicModel("clustering", "eu.anthropic.claude-sonnet-4-5"),
  ).toBe(true);
});

it("picks the first recommended model on the project's connection", () => {
  expect(
    pickRecommendedTopicModel("summary", [
      [
        "Amazon Bedrock",
        ["eu.anthropic.claude-sonnet-4-5", "eu.anthropic.claude-haiku-4-5"],
      ],
    ]),
  ).toEqual({
    provider: "Amazon Bedrock",
    model: "eu.anthropic.claude-haiku-4-5",
  });
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
  expect(draft.summary?.model).toBe("eu.anthropic.claude-haiku-4-5");
  expect(draft.embedding?.model).toBe("cohere.embed-english-v3");
  expect(draft.clustering?.model).toBe("eu.anthropic.claude-sonnet-4-5");
  expect(draft.waitMinutes).toBe(5);
  expect(draft.pastDays).toBe(7);
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

it("describes first data by the project idle time", () => {
  expect(firstTopicsEstimate(5)).toBe(
    "New traces are summarized after they have been idle for 5 min.",
  );
});

it("caps the past batch at 1,000 and warns below 100", () => {
  expect(pastBatchLimit(412, 100)).toBe(412);
  expect(pastBatchLimit(4_000, 100)).toBe(1_000);
  expect(pastBatchLimit(0, 100)).toBe(0);
  expect(pastBatchNotice(40, 100)?.kind).toBe("small");
  expect(pastBatchNotice(2_000, 100)?.kind).toBe("capped");
  expect(pastBatchNotice(412, 100)).toBeNull();
});

it("averages summary progress across facets", () => {
  expect(
    summaryRunProgress([
      { counts: { complete: 100, requested: 200 } },
      { counts: { complete: 50, requested: 200 } },
    ]),
  ).toEqual({ complete: 75, requested: 200 });
});

it("names the connection when the project has one provider", () => {
  expect(topicConnectionCaption(connections)).toBe("Amazon Bedrock");
  expect(topicConnectionCaption([])).toBe("No AI connection");
});
