import { expect, it } from "vitest";
import { DEFAULT_TOPIC_RULE_NAME } from "@langfuse/shared/topics";
import {
  canLeaveTopicQuestions,
  defaultTopicMapName,
  followsTopicRecommendations,
  initialTopicSetupDraft,
  isRecommendedTopicModel,
  pickRecommendedTopicModel,
  setupWaitMinutes,
  topicConnectionCaption,
  topicProviderGroups,
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
    baseURL: null,
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

it("lists embedding models first in the embedding picker only", () => {
  expect(topicProviderGroups(connections, "embedding")).toEqual([
    [
      "Amazon Bedrock",
      [
        "us.cohere.embed-v4:0",
        "us.anthropic.claude-haiku-5-5",
        "us.anthropic.claude-sonnet-5-5",
      ],
    ],
  ]);
  expect(topicProviderGroups(connections, "chat")[0]![1]).toEqual(
    connections[0]!.customModels,
  );
});

it("offers no retired gecko models for Google connections", () => {
  const groups = topicProviderGroups(
    ["google-ai-studio", "google-vertex-ai"].map((adapter) => ({
      id: adapter,
      provider: adapter,
      adapter,
      customModels: [],
      withDefaultModels: true,
      baseURL: null,
    })),
    "embedding",
  );
  for (const [, models] of groups) {
    expect(models.some((model) => /gecko/.test(model))).toBe(false);
    expect(models.some((model) => /embed/.test(model))).toBe(true);
  }
});

it("offers embedding models only where the connection can serve them", () => {
  const connection = (adapter: string, baseURL: string | null = null) => ({
    id: `${adapter}-${baseURL}`,
    provider: baseURL ?? adapter,
    adapter,
    customModels: [],
    withDefaultModels: true,
    baseURL,
  });
  expect(
    topicProviderGroups(
      [
        connection("anthropic"),
        connection("openai"),
        connection("openai", "https://api.openai.com/v1"),
        connection("openai", "https://eu.api.openai.com/v1"),
        connection("openai", "https://eu.api.openai.com.example.com/v1"),
        connection("openai", "https://api.deepseek.com"),
        connection("azure", "https://example.openai.azure.com"),
        connection("google-ai-studio"),
      ],
      "embedding",
    ),
  ).toEqual([
    [
      "openai",
      [
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002",
      ],
    ],
    [
      "https://api.openai.com/v1",
      [
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002",
      ],
    ],
    [
      "https://eu.api.openai.com/v1",
      [
        "text-embedding-3-small",
        "text-embedding-3-large",
        "text-embedding-ada-002",
      ],
    ],
    ["google-ai-studio", ["gemini-embedding-001", "gemini-embedding-2"]],
  ]);
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
        provider: "Amazon Bedrock",
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

it("names the map after the trace names its filter selects", () => {
  expect(defaultTopicMapName([])).toBe(DEFAULT_TOPIC_RULE_NAME);
  expect(
    defaultTopicMapName([
      { column: "traceName", type: "string", operator: "=", value: "chat" },
    ]),
  ).toBe("chat");
  expect(
    defaultTopicMapName([
      {
        column: "environment",
        type: "stringOptions",
        operator: "any of",
        value: ["production"],
      },
      {
        column: "traceName",
        type: "stringOptions",
        operator: "any of",
        value: ["support-agent", "billing-agent"],
      },
    ]),
  ).toBe("support-agent, billing-agent");
  expect(
    defaultTopicMapName([
      {
        column: "traceName",
        type: "string",
        operator: "contains",
        value: "agent",
      },
    ]),
  ).toBe(DEFAULT_TOPIC_RULE_NAME);
});

it("names the connection when the project has one provider", () => {
  expect(topicConnectionCaption(connections)).toBe("Amazon Bedrock");
  expect(topicConnectionCaption([])).toBe("No AI connection");
});
