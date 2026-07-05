import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { MockLanguageModelV4 } from "ai/test";
import { createOpenAI } from "@ai-sdk/openai";

import {
  ChatMessage,
  ChatMessageRole,
  ChatMessageType,
  LLMAdapter,
  type ModelParams,
  type TraceSinkParams,
} from "../types";
import { executeAiSdkCompletion } from "./executeAiSdkCompletion";

const publishToOtelIngestionQueue = vi.fn().mockResolvedValue(undefined);

vi.mock("../../otel/OtelIngestionProcessor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../otel/OtelIngestionProcessor")>();
  return {
    ...actual,
    OtelIngestionProcessor: class {
      publishToOtelIngestionQueue = publishToOtelIngestionQueue;
    },
  };
});

vi.mock("@ai-sdk/openai", () => ({
  createOpenAI: vi.fn(),
}));

const VALID_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

const traceSinkParams: TraceSinkParams = {
  targetProjectId: "project-1",
  traceId: VALID_TRACE_ID,
  traceName: "Execute evaluator: helpfulness",
  environment: "langfuse-llm-judge",
};

const modelParams: ModelParams = {
  provider: "openai",
  adapter: LLMAdapter.OpenAI,
  model: "gpt-4o",
  max_tokens: 128,
};

const messages: ChatMessage[] = [
  { type: ChatMessageType.User, role: ChatMessageRole.User, content: "Hi" },
];

// The AI SDK OTel integration parents its spans through the active OTel
// context; production web/worker runtimes register a context manager as part
// of their tracing setup, which this test mirrors.
const contextManager = new AsyncLocalStorageContextManager();

beforeAll(() => {
  context.setGlobalContextManager(contextManager.enable());
});

afterAll(() => {
  context.disable();
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createOpenAI).mockReturnValue({
    chat: () =>
      new MockLanguageModelV4({
        provider: "openai",
        modelId: "gpt-4o",
        doGenerate: {
          content: [{ type: "text", text: "Hello there" }],
          finishReason: { unified: "stop", raw: "stop" },
          usage: {
            inputTokens: {
              total: 3,
              noCache: 3,
              cacheRead: undefined,
              cacheWrite: undefined,
            },
            outputTokens: { total: 5, text: 5, reasoning: undefined },
          },
          warnings: [],
        },
      }),
  } as never);
});

describe("AI SDK telemetry integration", () => {
  it("captures generateText spans under the Langfuse trace and converts them via the OTel ingestion pipeline", async () => {
    const result = await executeAiSdkCompletion({
      messages,
      modelParams,
      streaming: false,
      apiKey: "sk-test",
      timeoutMs: 10_000,
      fetch: globalThis.fetch,
      apiMode: "chat-completions",
      traceSinkParams,
    });

    expect(result).toBe("Hello there");
    expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);

    const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];
    const spans = resourceSpans.flatMap((rs: any) =>
      rs.scopeSpans.flatMap((ss: any) => ss.spans),
    );

    // Root span + AI SDK operation/step/model-call spans, all on the trace.
    expect(spans.length).toBeGreaterThan(1);
    for (const span of spans) {
      expect(span.traceId.toLowerCase()).toBe(VALID_TRACE_ID);
    }

    // Every non-root span parents to another captured span (a single tree).
    const spanIds = new Set(spans.map((span: any) => span.spanId));
    const rootSpans = spans.filter((span: any) => !span.parentSpanId);
    expect(rootSpans).toHaveLength(1);
    expect(rootSpans[0].name).toBe("Execute evaluator: helpfulness");
    for (const span of spans) {
      if (span.parentSpanId) {
        expect(spanIds.has(span.parentSpanId)).toBe(true);
      }
    }

    // The captured spans convert through the real OTel ingestion processor —
    // the same code path the public /api/public/otel/v1/traces endpoint uses.
    const { OtelIngestionProcessor } = await vi.importActual<
      typeof import("../../otel/OtelIngestionProcessor")
    >("../../otel/OtelIngestionProcessor");
    const events = await new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "",
      sdkName: "langfuse-internal-ai-sdk",
      sdkVersion: "unknown",
    }).processToIngestionEvents(resourceSpans);

    expect(events.length).toBeGreaterThan(0);

    const traceEvents = events.filter((event) =>
      event.type.startsWith("trace-"),
    );
    expect(traceEvents.length).toBeGreaterThan(0);
    const fullTraceEvent = traceEvents.find(
      (event) => (event.body as { name?: string }).name,
    );
    expect(fullTraceEvent).toBeDefined();
    expect(fullTraceEvent!.body).toMatchObject({
      id: VALID_TRACE_ID,
      name: "Execute evaluator: helpfulness",
      environment: "langfuse-llm-judge",
    });

    // The model call span materializes as a generation with usage.
    const observationEvents = events.filter(
      (event) => !event.type.startsWith("trace-"),
    );
    const generation = observationEvents.find(
      (event) =>
        (event.body as { model?: string }).model === "gpt-4o" ||
        (event.body as { usageDetails?: unknown }).usageDetails !== undefined,
    );
    expect(generation).toBeDefined();
    expect((generation!.body as { environment?: string }).environment).toBe(
      "langfuse-llm-judge",
    );
  });
});
