import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { encrypt } from "@langfuse/shared/encryption";

const state = vi.hoisted(() => ({
  env: { LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS: ["project"] },
  call: vi.fn(),
  embed: vi.fn(),
  increment: vi.fn(),
  project: vi.fn(),
  traceSink: vi.fn(),
  responseMetadata: vi.fn(),
  spanAttributes: vi.fn(),
  encoding: null as {
    encode: ReturnType<typeof vi.fn>;
    free: ReturnType<typeof vi.fn>;
  } | null,
}));
vi.mock("tiktoken", async (importOriginal) => {
  const actual = await importOriginal<typeof import("tiktoken")>();
  return {
    ...actual,
    get_encoding: (...args: Parameters<typeof actual.get_encoding>) =>
      state.encoding ?? actual.get_encoding(...args),
  };
});
vi.mock("@langfuse/shared/src/env", () => ({ env: state.env }));
vi.mock("@langfuse/shared/src/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@langfuse/shared/src/server")>()),
  getLangfuseAITraceSinkParams: state.traceSink,
  LangfuseInternalTraceEnvironment: { Topics: "langfuse-topics" },
  logger: { warn: vi.fn() },
  recordIncrement: state.increment,
  instrumentAsync: async (
    _options: unknown,
    call: (span: { setAttributes: typeof state.spanAttributes }) => unknown,
  ) => call({ setAttributes: state.spanAttributes }),
}));
vi.mock("@langfuse/shared/src/db", () => ({
  prisma: { project: { findFirst: state.project } },
}));
vi.mock("@langfuse/shared/topics/server", async (importOriginal) => ({
  topicMessages: (
    await importOriginal<typeof import("@langfuse/shared/topics/server")>()
  ).topicMessages,
  generateTopicText: (...args: unknown[]) => state.call(...args),
  generateTopicEmbeddings: (...args: unknown[]) => state.embed(...args),
  getTopicTextResponseMetadata: (error: unknown) =>
    state.responseMetadata(error),
}));

// Token counters only; every call also records call and request-byte counters.
const tokenCalls = () =>
  state.increment.mock.calls.filter(([name]) =>
    String(name).startsWith("langfuse.topics.token"),
  );

import {
  embedTopicSummaries,
  nameTopicGroup as namePreparedTopicGroup,
  prepareTopicNamingGroup,
  summarizeTopicTraceFacets,
} from "./models";
import {
  topicProcessingConfigSchema,
  type TopicProcessingConfig,
} from "@langfuse/shared/topics";
import { LLMAdapter } from "@langfuse/shared";
import { logger } from "@langfuse/shared/src/server";
import { recordTopicModelCall } from "./metrics";
import type { TopicsModel, TopicsModels } from "@langfuse/shared/topics/server";

async function nameTopicGroup(
  models: TopicsModels,
  group: Parameters<typeof prepareTopicNamingGroup>[0],
) {
  return namePreparedTopicGroup(
    models,
    await prepareTopicNamingGroup(group, "naming-test"),
  );
}

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
    { id: "m1", summary: "The user requests an invoice." },
    { id: "m2", summary: "The user requests billing corrections." },
  ],
  contrasts: [{ id: "contrast", summary: "The user requests translation." }],
};

beforeEach(() => {
  state.env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS = ["project"];
  state.call.mockReset();
  state.embed.mockReset();
  state.increment.mockReset();
  state.responseMetadata.mockReset();
  state.spanAttributes.mockReset();
  vi.mocked(logger.warn).mockClear();
  state.project.mockReset().mockResolvedValue({
    organization: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
  });
  state.encoding = null;
  state.traceSink.mockReset().mockImplementation((params) => ({
    targetProjectId: "ai-features",
    traceId: "a".repeat(32),
    traceName: params.traceName,
    environment: "production",
    aiFeatureOtelIngestion: true,
    metadata: {
      langfuse_ai_feature: params.feature,
      langfuse_project_id: params.projectId,
      ...params.metadata,
    },
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// One built-in facet through the shared multi-facet request.
const summarizeOne = (
  models: TopicsModels,
  text: string,
  config: TopicProcessingConfig,
) =>
  summarizeTopicTraceFacets(
    models,
    [{ key: "intent", facet, builtIn: true }],
    text,
    config,
  );
const keyed = (output: Record<string, unknown>) => ({
  intent: { notes: "Evidence.", ...output },
});

describe("Topics naming boundary", () => {
  it("keeps invalid cached Bedrock output per-trace and records paid usage", async () => {
    const { generateTopicText } = await vi.importActual<
      typeof import("@langfuse/shared/topics/server")
    >("@langfuse/shared/topics/server");
    state.call.mockImplementation(generateTopicText);
    state.env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: JSON.stringify(
                  keyed({ summary: 42, status: "applicable" }),
                ),
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
      ),
    );
    const models = topicsModels();
    models.summary.connection.secretKey = encrypt(
      JSON.stringify({ accessKeyId: "AKIATOPICS", secretAccessKey: "test" }),
    );

    await expect(
      summarizeOne(
        models,
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: models.summary.model,
        }),
      ),
    ).rejects.toMatchObject({ name: "ZodError" });
    expect(state.increment).toHaveBeenCalledWith("langfuse.topics.tokens", 12, {
      stage: "summary",
      direction: "input",
    });
    expect(state.increment).toHaveBeenCalledWith("langfuse.topics.tokens", 4, {
      stage: "summary",
      direction: "output",
    });
  });

  it("classifies text after a valid cached Bedrock object as invalid output", async () => {
    const { generateTopicText } = await vi.importActual<
      typeof import("@langfuse/shared/topics/server")
    >("@langfuse/shared/topics/server");
    state.call.mockImplementation(generateTopicText);
    state.env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: `${JSON.stringify(keyed({ summary: "A request.", status: "applicable" }))} assistant {"intent_1":`,
              },
            },
          ],
          usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 },
        }),
      ),
    );
    const models = topicsModels();
    models.summary.connection.secretKey = encrypt(
      JSON.stringify({ accessKeyId: "AKIATOPICS", secretAccessKey: "test" }),
    );

    await expect(
      summarizeOne(
        models,
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: models.summary.model,
        }),
      ),
    ).rejects.toMatchObject({ reason: "invalid_output" });
  });

  it.each([
    ["us.openai.gpt-5.6-luna", 0.00002, 0.000036],
    ["us.openai.gpt-6-luna", 0.000011, 0.0000165],
    ["global.openai.gpt-6-luna", 0.00001, 0.000015],
  ])(
    "summarizes a trace and prices %s usage",
    async (model, inputCost, outputCost) => {
      state.call.mockResolvedValue({
        output: keyed({ summary: "A billing request.", status: "applicable" }),
        usage: { inputTokens: 100, outputTokens: 30 },
      });
      const result = await summarizeOne(
        topicsModels(model),
        "RAW_TRANSCRIPT_SENTINEL",
        topicProcessingConfigSchema.parse({
          summaryModel: model,
        }),
      );
      expect(result.output).toEqual(
        keyed({ summary: "A billing request.", status: "applicable" }),
      );
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
      expect(request.trace).toMatchObject({
        targetProjectId: "ai-features",
        traceName: "topics-summary",
        environment: "langfuse-topics",
        aiFeatureOtelIngestion: false,
        metadata: {
          langfuse_project_id: "project",
          facets: [{ key: "intent", facet_id: "facet", facet_version: 1 }],
        },
      });
      expect(request.system).toEqual([
        { text: expect.stringContaining(facet.prompt), cache: true },
      ]);
      expect(request.input).toBe(
        "<transcript>\nRAW_TRANSCRIPT_SENTINEL\n</transcript>\n\nWrite the summaries now, one per facet key, each in its facet's format.",
      );
    },
  );

  it("rejects a request frozen on another summary model before calling the provider", async () => {
    await expect(
      summarizeOne(
        topicsModels("us.openai.gpt-6-luna"),
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toMatchObject({ reason: "configuration" });
    expect(state.call).not.toHaveBeenCalled();
  });

  it("excludes provider content from failure logs and spans, including echoed error fields", async () => {
    // The AI SDK identifies an APICallError by these markers.
    const rejection = Object.assign(
      new Error("Invalid input: secret transcript"),
      {
        [Symbol.for("vercel.ai.error")]: true,
        [Symbol.for("vercel.ai.error.AI_APICallError")]: true,
        name: "AI_APICallError",
        statusCode: 400,
        isRetryable: false,
        requestBodyValues: { messages: "secret transcript" },
        responseBody: '{"error":{"message":"secret echo"}}',
        data: {
          error: {
            type: "secret error type",
            code: "secret error code",
            param: "secret input value",
          },
        },
      },
    );
    state.call.mockRejectedValue(rejection);
    await expect(
      summarizeOne(
        topicsModels(),
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toMatchObject({ reason: "invalid_input" });
    const [message, fields] = vi.mocked(logger.warn).mock.calls.at(-1)!;
    expect(message).toBe("Topics model request failed");
    expect(fields).toMatchObject({
      "http.status_code": 400,
    });
    expect(JSON.stringify(fields)).not.toMatch(/secret/);
    expect(JSON.stringify(state.spanAttributes.mock.calls)).not.toMatch(
      /secret/,
    );
    expect(state.increment).toHaveBeenCalledWith(
      "langfuse.topics.llm_calls",
      1,
      {
        stage: "summary",
        adapter: LLMAdapter.Bedrock,
        status: "400",
      },
    );
  });

  it("reports unusable naming output without logging provider content", async () => {
    const rejection = Object.assign(new Error("secret response text"), {
      name: "AI_NoOutputGeneratedError",
      responseBody: "secret response body",
      text: "secret model output",
    });
    const response = {
      "langfuse.topics.response.finish_reason": "other",
      "langfuse.topics.response.raw_finish_reason": "refusal",
      "langfuse.topics.response.text_characters": 0,
      "langfuse.topics.response.output_tokens": 0,
    };
    state.responseMetadata.mockImplementation((error) =>
      error === rejection ? response : undefined,
    );
    state.call.mockRejectedValue(rejection);

    const failure = await nameTopicGroup(topicsModels(), evidence).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({
      reason: "invalid_output",
      message: expect.stringContaining("returned no usable structured output"),
    });
    expect((failure as Error).message).not.toMatch(/credentials|secret/);
    expect(logger.warn).toHaveBeenCalledOnce();
    const [message, fields] = vi.mocked(logger.warn).mock.calls[0];
    expect(message).toBe("Topics model request failed");
    expect(fields).toMatchObject({
      ...response,
      "langfuse.topics.error.reason": "invalid_output",
      "langfuse.topics.error.type": "AI_NoOutputGeneratedError",
    });
    expect(state.spanAttributes).toHaveBeenCalledWith(fields);
    expect(JSON.stringify(fields)).not.toMatch(/secret/);
    expect(JSON.stringify(state.spanAttributes.mock.calls)).not.toMatch(
      /secret/,
    );
    expect(state.increment).toHaveBeenCalledWith(
      "langfuse.topics.llm_calls",
      1,
      {
        stage: "naming",
        adapter: LLMAdapter.Bedrock,
        status: "invalid_output",
      },
    );
  });

  it.each([
    [{}, "ok"],
    [{ httpStatus: 429, reason: "rate_limit" }, "429"],
    [{ httpStatus: 404, reason: "invalid_input" }, "4xx"],
    [{ httpStatus: 503, reason: "provider_error" }, "5xx"],
    [{ reason: "timeout" }, "timeout"],
  ])("tags a model call outcome %o as %s", (outcome, status) => {
    recordTopicModelCall("summary", LLMAdapter.OpenAI, outcome);
    expect(state.increment).toHaveBeenCalledWith(
      "langfuse.topics.llm_calls",
      1,
      {
        stage: "summary",
        adapter: LLMAdapter.OpenAI,
        status,
      },
    );
  });

  it("logs only the status for an error whose message carries the response body", async () => {
    // The direct Bedrock call throws a plain error with the response text.
    state.call.mockRejectedValue(
      Object.assign(
        new Error('Bedrock InvokeModel failed with 400: {"secret": "echo"}'),
        { status: 400 },
      ),
    );
    await expect(
      summarizeOne(
        topicsModels(),
        "Trace evidence.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      ),
    ).rejects.toMatchObject({ reason: "invalid_input" });
    const [, fields] = vi.mocked(logger.warn).mock.calls.at(-1)!;
    expect(fields).toMatchObject({ "http.status_code": 400 });
    expect(JSON.stringify(fields)).not.toMatch(/secret/);
  });

  it("keeps fallback token counts out of provider-reported usage", async () => {
    state.call.mockResolvedValue({
      output: keyed({ summary: "A billing request.", status: "applicable" }),
      usage: { inputTokens: 100 },
    });
    const config = topicProcessingConfigSchema.parse({
      summaryModel: "us.openai.gpt-5.6-luna",
    });
    const result = await summarizeOne(
      topicsModels(),
      "A request for an invoice.",
      config,
    );
    expect(result.providedUsageDetails).toEqual({ summary_input: 100 });
    expect(tokenCalls()).toEqual([
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
      summarizeOne(
        topicsModels(),
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
      output: keyed({ summary: "A billing request.", status: "applicable" }),
      usage: {
        inputTokens: 4000,
        outputTokens: 300,
        totalTokens: 4300,
        cacheReadTokens: 2840,
        cacheWriteTokens: 100,
      },
    });
    const result = await summarizeOne(
      topicsModels("us.openai.gpt-6-luna"),
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
    expect(request.trace).toMatchObject({
      traceName: "topics-summary",
      environment: "langfuse-topics",
      metadata: {
        langfuse_project_id: "project",
        facets: [
          { key: "intent_1", facet_id: "facet", facet_version: 1 },
          { key: "issues_2", facet_id: "issues", facet_version: 1 },
        ],
      },
    });
    expect(state.project).toHaveBeenCalledWith({
      where: { id: "project", deletedAt: null },
      select: {
        organization: {
          select: { aiFeaturesEnabled: true, aiTelemetryEnabled: true },
        },
      },
    });
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
      id: `m${index + 1}`,
      summary: `Request ${index}: ${"Invoice request details. ".repeat(60)} END-${index}`,
    }));
    const summaries = members.map(({ summary }) => summary);
    state.call.mockResolvedValue({
      output: {
        name: "Invoice assistance",
        description: "Requests involving invoices.",
        evidenceSummaryIds: ["m400"],
      },
      usage: { inputTokens: 16000, outputTokens: 30 },
    });
    const result = await nameTopicGroup(topicsModels(), {
      members,
      contrasts: [],
    });
    expect(result.output).toMatchObject({
      name: "Invoice assistance",
      evidenceSummaryIds: ["m400"],
    });
    expect(state.call).toHaveBeenCalledOnce();
    expect(state.call.mock.calls[0][0].trace).toMatchObject({
      traceName: "topics-naming",
      environment: "langfuse-topics",
      metadata: { langfuse_project_id: "project" },
    });
    expect(state.call.mock.calls[0][0].model).toMatchObject({
      slot: "clustering",
      model: "us.openai.gpt-5.6-terra",
    });
    expect(result.costDetails.total).toBeCloseTo(0.03236, 10);
    const submitted = JSON.parse(state.call.mock.calls[0][0].input);
    expect(
      submitted.members
        .map(({ summary }: { summary: string }) => summary)
        .sort(),
    ).toEqual(summaries.sort());
    expect(state.call.mock.calls[0][0].trace.metadata.naming_sampled).toBe(
      false,
    );
  });

  it("names complete sampled summaries, reuses them for renames and rejects omitted citations", async () => {
    state.encoding = {
      encode: vi.fn((text: string) => ({
        length:
          (text.match(/NAMING_MEMBER/g)?.length ?? 0) * 220_000 + text.length,
      })),
      free: vi.fn(),
    };
    const makeGroup = () => ({
      members: Array.from({ length: 12 }, (_, index) => ({
        summary: `NAMING_MEMBER invoice request ${index}.`,
        traceId: `trace-${index}`,
      })),
      contrasts: [],
    });
    const group = makeGroup();
    const sources = [...group.members];
    const prepared = await prepareTopicNamingGroup(group, "run-a/group-a");
    expect(prepared.sampled).toBe(true);
    expect(prepared.members.length).toBeLessThan(group.members.length);
    expect(new Set(prepared.members.map(({ id }) => id)).size).toBe(
      prepared.members.length,
    );
    expect(prepared.members).toEqual(
      (await prepareTopicNamingGroup(makeGroup(), "run-a/group-a")).members,
    );
    expect(prepared.members).not.toEqual(
      (await prepareTopicNamingGroup(makeGroup(), "run-b/group-a")).members,
    );
    for (const member of prepared.members) {
      expect(sources.find(({ summary }) => summary === member.summary)).toBe(
        member.source,
      );
    }
    group.members.reverse();
    state.call.mockImplementation(async ({ input }) => ({
      output: {
        name: "Invoice requests",
        description: "Requests involving invoices.",
        evidenceSummaryIds: [JSON.parse(input).members[0].id],
      },
      usage: {},
    }));
    const first = await namePreparedTopicGroup(topicsModels(), prepared);
    const conflict = {
      name: "Billing support",
      description: "Support for billing problems.",
      summaries: [
        "NAMING_MEMBER too large for the retry reserve.",
        "A billing question.",
      ],
    };
    const renamed = await namePreparedTopicGroup(
      topicsModels(),
      prepared,
      undefined,
      conflict,
    );
    const [initialCall, renameCall] = state.call.mock.calls.map(
      ([call]) => call,
    );
    const [initialRequest, renameRequest] = state.call.mock.calls.map(
      ([request]) => JSON.parse(request.input),
    );
    expect(initialRequest.members).toEqual(
      prepared.members.map(({ id, summary }) => ({ id, summary })),
    );
    expect(renameRequest.members).toEqual(initialRequest.members);
    expect(renameRequest.conflictingTopic).toEqual({
      ...conflict,
      summaries: ["A billing question."],
    });
    expect(initialCall.trace.traceName).toBe("topics-naming");
    expect(renameCall.trace.traceName).toBe("topics-naming-conflict");
    expect(renameCall.system[0].text).toContain(initialCall.system[0].text);
    expect(renamed.usageDetails.naming_input).toBeGreaterThan(
      first.usageDetails.naming_input!,
    );
    expect(renamed.usageDetails.naming_input).toBeLessThanOrEqual(900_000);

    const omittedId = Array.from(
      { length: group.members.length },
      (_, index) => `m${index + 1}`,
    ).find((id) => !prepared.members.some((member) => member.id === id));
    state.call.mockResolvedValueOnce({
      output: {
        name: "Invoice requests",
        description: "Requests involving invoices.",
        evidenceSummaryIds: [omittedId],
      },
      usage: { inputTokens: 100, outputTokens: 30 },
    });
    await expect(
      namePreparedTopicGroup(topicsModels(), prepared),
    ).rejects.toThrow("Evidence must cite a submitted cluster member.");
  });

  it("skips individually oversized members and fails before inference when none fit", async () => {
    state.encoding = {
      encode: vi.fn((text: string) => ({
        length: text.includes("OVERSIZED") ? 1_000_000 : text.length,
      })),
      free: vi.fn(),
    };
    const prepared = await prepareTopicNamingGroup(
      {
        members: [
          { summary: "OVERSIZED" },
          { summary: "A complete invoice question." },
        ],
        contrasts: [{ id: "contrast", summary: "OVERSIZED" }],
      },
      "oversized",
    );
    expect(prepared.members.map(({ summary }) => summary)).toEqual([
      "A complete invoice question.",
    ]);
    expect(JSON.parse(prepared.input).contrasts).toEqual([]);
    await expect(
      prepareTopicNamingGroup(
        { members: [{ summary: "OVERSIZED" }], contrasts: [] },
        "oversized",
      ),
    ).rejects.toThrow("No complete cluster member summary fits");
    expect(state.call).not.toHaveBeenCalled();
    expect(state.encoding.free).toHaveBeenCalledTimes(2);
  });

  it("bounds serialized bytes independently of token estimates", async () => {
    state.encoding = {
      encode: vi.fn(() => ({ length: 1 })),
      free: vi.fn(),
    };
    const summary = "x".repeat(1024 * 1024);
    const group = {
      members: Array.from({ length: 17 }, () => ({ summary })),
      contrasts: [],
    };
    const prepared = await prepareTopicNamingGroup(group, "byte-budget");
    expect(prepared.sampled).toBe(true);
    expect(prepared.members.length).toBeGreaterThan(0);
    expect(Buffer.byteLength(prepared.input)).toBeLessThanOrEqual(
      16 * 1024 * 1024,
    );
    expect(prepared.members.every((member) => member.summary === summary)).toBe(
      true,
    );
  });

  it("yields while preparing escaped summaries and preserves complete text", async () => {
    state.encoding = {
      encode: vi.fn((text: string) => ({ length: text.length })),
      free: vi.fn(),
    };
    let elapsed = 0;
    const time = vi
      .spyOn(performance, "now")
      .mockImplementation(() => (elapsed += 2));
    let ticked = false;
    const heartbeat = setImmediate(() => {
      ticked = true;
    });
    const summary = `${"x".repeat(4095)}😀\u0000\n\"\\${"y".repeat(12_000)}`;
    try {
      const prepared = await prepareTopicNamingGroup(
        { members: [{ summary }], contrasts: [] },
        "yield",
      );
      expect(ticked).toBe(true);
      expect(JSON.parse(prepared.input).members).toEqual([
        { id: "m1", summary },
      ]);
      expect(
        state.encoding.encode.mock.calls.every(([text]) => text.length <= 4096),
      ).toBe(true);
    } finally {
      clearImmediate(heartbeat);
      time.mockRestore();
    }
  });

  it("trims names and rejects whitespace-only descriptions", async () => {
    state.call.mockResolvedValueOnce({
      output: {
        name: " Invoice assistance ",
        description: "Invoice requests.",
        evidenceSummaryIds: ["m1"],
      },
      usage: {},
    });
    expect((await nameTopicGroup(topicsModels(), evidence)).output.name).toBe(
      "Invoice assistance",
    );
    state.call.mockResolvedValueOnce({
      output: {
        name: "Invoice assistance",
        description: "   ",
        evidenceSummaryIds: ["m1"],
      },
      usage: {},
    });
    await expect(nameTopicGroup(topicsModels(), evidence)).rejects.toThrow();
  });

  it.each([["contrast"], ["m1", "m2", "m1", "m2"]])(
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
      expect(tokenCalls()).toEqual([
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

  it.each([
    { aiFeaturesEnabled: true, aiTelemetryEnabled: false },
    { aiFeaturesEnabled: false, aiTelemetryEnabled: true },
    null,
    new Error("database unavailable"),
  ])(
    "keeps inference untraced without organization consent: %j",
    async (organization) => {
      if (organization instanceof Error)
        state.project.mockRejectedValue(organization);
      else
        state.project.mockResolvedValue(organization ? { organization } : null);
      state.call
        .mockResolvedValueOnce({
          output: keyed({
            summary: "A billing request.",
            status: "applicable",
          }),
          usage: {},
        })
        .mockResolvedValueOnce({
          output: {
            name: "Billing",
            description: "Billing requests.",
            evidenceSummaryIds: ["m1"],
          },
          usage: {},
        });
      await summarizeOne(
        topicsModels(),
        "A billing request.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      );
      await nameTopicGroup(topicsModels(), evidence);
      state.call.mockResolvedValueOnce({
        output: {
          intent: {
            notes: "Invoice request.",
            summary: "Request invoice.",
            status: "applicable",
          },
        },
        usage: {},
      });
      await summarizeTopicTraceFacets(
        topicsModels(),
        [{ key: "intent", facet, builtIn: true }],
        "Request invoice.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      );
      expect(state.call).toHaveBeenCalledTimes(3);
      for (const [request] of state.call.mock.calls)
        expect(request.trace).toBeUndefined();
    },
  );

  it.each(["unconfigured destination", "empty allowlist", "unlisted source"])(
    "keeps inference untraced and skips the consent lookup with %s",
    async (reason) => {
      if (reason === "unconfigured destination")
        state.traceSink.mockReturnValue(undefined);
      else
        state.env.LANGFUSE_TOPICS_TRACING_ENABLED_PROJECT_IDS =
          reason === "empty allowlist" ? [] : ["ai-features", "project-other"];
      state.call.mockResolvedValue({
        output: keyed({ summary: "A billing request.", status: "applicable" }),
        usage: {},
      });
      await summarizeOne(
        topicsModels(),
        "A billing request.",
        topicProcessingConfigSchema.parse({
          summaryModel: "us.openai.gpt-5.6-luna",
        }),
      );
      expect(state.project).not.toHaveBeenCalled();
      expect(state.call).toHaveBeenCalledOnce();
      expect(state.call.mock.calls[0][0].trace).toBeUndefined();
      if (reason !== "unconfigured destination")
        expect(state.traceSink).not.toHaveBeenCalled();
    },
  );

  it("records embedding input usage even when the returned vector is invalid", async () => {
    state.embed.mockResolvedValue({ embeddings: [[]], tokens: 12 });
    await expect(
      embedTopicSummaries(
        topicsModels().embedding,
        ["An invoice request."],
        256,
        "project",
      ),
    ).rejects.toMatchObject({
      reason: "invalid_output",
    });
    expect(tokenCalls()).toEqual([
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
        embeddings: [Array(256).fill(0.25)],
        tokens,
      });
      await embedTopicSummaries(
        topicsModels().embedding,
        ["An invoice request."],
        256,
        "project",
      );
      expect(tokenCalls()).toEqual([
        [
          "langfuse.topics.token_usage_missing",
          1,
          { stage: "embedding", direction: "input" },
        ],
      ]);
    },
  );
});
