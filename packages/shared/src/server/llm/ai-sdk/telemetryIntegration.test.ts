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

// System-first message lists are the norm for compiled experiment prompts and
// playground calls; AI SDK v7 rejects system messages in `messages` unless
// allowSystemInMessages is set, so this shape must go through the REAL
// generateText here (regression: every experiment item failed instantly with
// InvalidPromptError and undefined output).
const messages: ChatMessage[] = [
  {
    type: ChatMessageType.System,
    role: ChatMessageRole.System,
    content: "You answer in a single word.",
  },
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

    // Exactly two spans: the internal root and one generation per model call
    // (the minimal telemetry integration emits no operation/step spans).
    expect(spans).toHaveLength(2);
    for (const span of spans) {
      expect(span.traceId.toLowerCase()).toBe(VALID_TRACE_ID);
    }

    const rootSpans = spans.filter((span: any) => !span.parentSpanId);
    expect(rootSpans).toHaveLength(1);
    expect(rootSpans[0].name).toBe("Execute evaluator: helpfulness");

    const generationSpan = spans.find((span: any) => span.parentSpanId);
    expect(generationSpan.name).toBe("chat gpt-4o");
    expect(generationSpan.parentSpanId).toBe(rootSpans[0].spanId);

    // The captured spans convert through the real OTel ingestion processor —
    // the same code path the public /api/public/otel/v1/traces endpoint uses.
    const { OtelIngestionProcessor } = await vi.importActual<
      typeof import("../../otel/OtelIngestionProcessor")
    >("../../otel/OtelIngestionProcessor");
    const processor = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "",
      sdkName: "langfuse-internal-ai-sdk",
      sdkVersion: "unknown",
    });
    // The seen-traces dedup cache is Redis-backed; CI runs shared tests
    // without a Redis service, so the lookup would hang until test timeout.
    vi.spyOn(
      processor as unknown as { getSeenTracesSet: () => Promise<Set<string>> },
      "getSeenTracesSet",
    ).mockResolvedValue(new Set());
    const events = await processor.processToIngestionEvents(resourceSpans);

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

    // The model call span materializes as a generation with usage — and it is
    // the ONLY costed observation. This is the double-costing regression
    // guard: @ai-sdk/otel put gen_ai.usage on both the operation and the
    // model-call span, doubling every internal trace's cost.
    const observationEvents = events.filter(
      (event) => !event.type.startsWith("trace-"),
    );
    const costedObservations = observationEvents.filter((event) => {
      const body = event.body as {
        model?: string;
        usageDetails?: Record<string, unknown>;
      };
      return (
        body.model !== undefined ||
        Object.keys(body.usageDetails ?? {}).length > 0
      );
    });
    expect(costedObservations).toHaveLength(1);
    const generation = costedObservations[0];
    expect(generation.type).toBe("generation-create");
    expect(generation.body).toMatchObject({
      name: "chat gpt-4o",
      model: "gpt-4o",
      usageDetails: { input: 3, output: 5 },
      environment: "langfuse-llm-judge",
    });
  });

  it("tags experiment run items so the ingestion pipeline can schedule experiment evals", async () => {
    const experimentTraceId = "1af7651916cd43dd8448eb211c80319d";

    const result = await executeAiSdkCompletion({
      messages,
      modelParams,
      streaming: false,
      apiKey: "sk-test",
      timeoutMs: 10_000,
      fetch: globalThis.fetch,
      apiMode: "chat-completions",
      traceSinkParams: {
        targetProjectId: "project-1",
        traceId: experimentTraceId,
        traceName: "dataset-run-item-abc12",
        environment: "langfuse-prompt-experiment",
        eventsWriter: {
          experimentContext: {
            id: "run-1",
            name: "run name",
            datasetId: "dataset-1",
            itemId: "item-1",
            itemVersion: "2026-01-01T00:00:00.000Z",
            itemExpectedOutput: { answer: 42 },
            metadata: { source: "test" },
          },
          write: async () => {},
        },
      },
    });

    expect(result).toBe("Hello there");
    expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
    const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];

    // Convert through the real processor exactly like the OTel ingestion
    // queue's eval-scheduling step (processToEvent -> createEventRecord).
    const { OtelIngestionProcessor } = await vi.importActual<
      typeof import("../../otel/OtelIngestionProcessor")
    >("../../otel/OtelIngestionProcessor");
    const eventInputs = new OtelIngestionProcessor({
      projectId: "project-1",
      publicKey: "",
      sdkName: "langfuse-internal-ai-sdk",
      sdkVersion: "unknown",
    }).processToEvent(resourceSpans);

    const roots = eventInputs.filter((input: any) => !input.parentSpanId);
    expect(roots).toHaveLength(1);
    const root = roots[0];

    // The run-item root observation is self-referencing, which is what the
    // queue-side guard requires to schedule experiment observation evals.
    expect(root.environment).toBe("langfuse-prompt-experiment");
    expect(root.experimentId).toBe("run-1");
    expect(root.experimentDatasetId).toBe("dataset-1");
    expect(root.experimentItemId).toBe("item-1");
    expect(root.experimentItemRootSpanId).toBe(root.spanId);
    expect(root.experimentItemExpectedOutput).toBe(
      JSON.stringify({ answer: 42 }),
    );

    // The root observation carries the completion IO that experiment eval
    // variable mapping reads.
    expect(root.input).toBeDefined();
    expect(root.output).toBeDefined();
    expect(String(root.output)).toContain("Hello there");

    // Child spans point at the root and never at themselves, so only the
    // run-item root can pass the queue-side eval guard. With the minimal
    // telemetry integration there is exactly one child: the generation.
    const children = eventInputs.filter((input: any) => input.parentSpanId);
    expect(children).toHaveLength(1);
    for (const child of children) {
      expect(child.environment).toBe("langfuse-prompt-experiment");
      expect(child.experimentItemRootSpanId).toBe(root.spanId);
      expect(child.spanId).not.toBe(root.spanId);
    }
  });
});
