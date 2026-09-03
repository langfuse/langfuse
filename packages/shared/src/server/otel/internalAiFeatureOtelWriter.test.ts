import { beforeEach, describe, expect, it, vi } from "vitest";

import { createIngestionEventSchema } from "../ingestion/types";
import { buildInternalTraceEventInputs } from "../llm/internalTraceEvents";
import {
  AI_FEATURE_OTEL_SDK_NAME,
  LangfuseOtelSpanAttributes,
} from "./attributes";
import { publishAiFeatureTraceViaOtelIngestion } from "./internalAiFeatureOtelWriter";

const publishToOtelIngestionQueue = vi.fn().mockResolvedValue(undefined);
const processorConstructor = vi.fn();

vi.mock("./OtelIngestionProcessor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./OtelIngestionProcessor")>();
  return {
    ...actual,
    OtelIngestionProcessor: class {
      constructor(config: unknown) {
        processorConstructor(config);
      }
      publishToOtelIngestionQueue = publishToOtelIngestionQueue;
    },
  };
});

const START_ISO = "2026-08-27T12:00:00.000Z";
const END_ISO = "2026-08-27T12:00:01.000Z";
const RUN_ID = "arun_01234567-89ab-cdef-0123-456789abcdef";
const TRACE_ID = `${RUN_ID}-trace`;

const processedEvents = [
  {
    type: "trace-create",
    timestamp: START_ISO,
    body: {
      id: TRACE_ID,
      traceId: TRACE_ID,
      name: "agent-turn",
      environment: "production",
      tags: ["in-app-agent"],
      userId: "user-1",
      sessionId: "conversation-1",
      startTime: START_ISO,
      endTime: END_ISO,
      input: "hello",
      output: "hi",
    },
  },
  {
    type: "agent-create",
    timestamp: START_ISO,
    body: {
      id: RUN_ID,
      traceId: TRACE_ID,
      name: "agent-turn",
      environment: "production",
      startTime: START_ISO,
      endTime: END_ISO,
      input: { messages: [{ role: "user", content: "hello" }] },
      output: { text: "hi" },
      metadata: { langfuse_ai_feature: "in-app-agent" },
    },
  },
  {
    type: "tool-create",
    timestamp: START_ISO,
    body: {
      id: "tool-call-1",
      traceId: TRACE_ID,
      parentObservationId: RUN_ID,
      name: "langfuse_listPrompts",
      environment: "production",
      startTime: START_ISO,
      endTime: END_ISO,
    },
  },
  {
    type: "generation-create",
    timestamp: START_ISO,
    body: {
      id: `${RUN_ID}-llm-0`,
      traceId: TRACE_ID,
      parentObservationId: RUN_ID,
      name: "invoke-model",
      environment: "production",
      startTime: new Date(START_ISO),
      endTime: new Date(END_ISO),
      model: "claude-opus",
      usageDetails: { input: 10, output: 5, total: 15 },
      promptName: "in-app-agent-system",
      promptVersion: 3,
    },
  },
];

const getPublishedResourceSpans = () => {
  expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
  return publishToOtelIngestionQueue.mock.calls[0][0];
};

const spanAttributeMap = (span: {
  attributes?: Array<{ key: string; value: { stringValue?: string } }>;
}) =>
  Object.fromEntries(
    (span.attributes ?? []).map((attribute) => [
      attribute.key,
      attribute.value.stringValue,
    ]),
  );

const createProcessor = async (sdkName = AI_FEATURE_OTEL_SDK_NAME) => {
  const { OtelIngestionProcessor } = await vi.importActual<
    typeof import("./OtelIngestionProcessor")
  >("./OtelIngestionProcessor");
  return new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "",
    sdkName,
    sdkVersion: "unknown",
    ingestionVersion: "4",
    isLangfuseInternal: false,
  });
};

const processPublishedSpans = async (sdkName = AI_FEATURE_OTEL_SDK_NAME) => {
  const resourceSpans = getPublishedResourceSpans();
  return (await createProcessor(sdkName)).processToEvent(resourceSpans);
};

const processPublishedIngestionEvents = async () => {
  const resourceSpans = getPublishedResourceSpans();
  const processor = await createProcessor();
  vi.spyOn(
    processor as unknown as { getSeenTracesSet: () => Promise<Set<string>> },
    "getSeenTracesSet",
  ).mockResolvedValue(new Set());
  return processor.processToIngestionEvents(resourceSpans);
};

const publishFixture = async () => {
  const { eventInputs } = buildInternalTraceEventInputs({
    processedEvents,
    traceId: TRACE_ID,
    projectId: "project-1",
  });

  await publishAiFeatureTraceViaOtelIngestion({
    projectId: "project-1",
    eventInputs,
  });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishAiFeatureTraceViaOtelIngestion", () => {
  it("preserves agent and tool observation types from SDK event types", async () => {
    await publishFixture();

    expect(processorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestionVersion: "4",
        isLangfuseInternal: false,
        sdkName: AI_FEATURE_OTEL_SDK_NAME,
      }),
    );

    const events = await processPublishedSpans();
    expect(events).toHaveLength(4);

    const wrappingRoot = events.find((event) => event.spanId === TRACE_ID);
    const agent = events.find((event) => event.spanId === RUN_ID);
    const tool = events.find((event) => event.spanId === "tool-call-1");
    const generation = events.find(
      (event) => event.spanId === `${RUN_ID}-llm-0`,
    );

    expect(wrappingRoot).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: null,
      name: "agent-turn",
      traceName: "agent-turn",
      type: "SPAN",
      environment: "production",
      userId: "user-1",
      sessionId: "conversation-1",
    });
    expect(wrappingRoot?.input).toBe("hello");
    expect(wrappingRoot?.output).toBe("hi");
    expect(wrappingRoot?.tags).toEqual(["in-app-agent"]);
    expect(agent).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: TRACE_ID,
      name: "agent-turn",
      traceName: "agent-turn",
      type: "AGENT",
      environment: "production",
    });
    expect(generation).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: RUN_ID,
      name: "invoke-model",
      traceName: "agent-turn",
      type: "GENERATION",
      environment: "production",
      modelName: "claude-opus",
      userId: "user-1",
      sessionId: "conversation-1",
      promptName: "in-app-agent-system",
      promptVersion: 3,
    });
    expect(tool).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: RUN_ID,
      name: "langfuse_listPrompts",
      traceName: "agent-turn",
      type: "TOOL",
      environment: "production",
      userId: "user-1",
      sessionId: "conversation-1",
    });
    expect(generation?.providedUsageDetails).toMatchObject({
      input: 10,
      output: 5,
      total: 15,
    });
  });

  it("keeps langfuse.trace.name on the wrapping root only", async () => {
    await publishFixture();

    const spans = getPublishedResourceSpans().flatMap((resourceSpan: any) =>
      resourceSpan.scopeSpans.flatMap((scopeSpan: any) => scopeSpan.spans),
    );
    const root = spans.find((span: any) => !span.parentSpanId);
    const children = spans.filter((span: any) => span.parentSpanId);

    expect(spanAttributeMap(root)[LangfuseOtelSpanAttributes.TRACE_NAME]).toBe(
      "agent-turn",
    );
    expect(children).toHaveLength(3);
    for (const child of children) {
      expect(
        spanAttributeMap(child)[LangfuseOtelSpanAttributes.TRACE_NAME],
      ).toBe(undefined);
    }
  });

  it("does not copy the batch-root traceName onto children for other SDK names", async () => {
    await publishFixture();

    const events = await processPublishedSpans("langfuse-internal-otel-writer");
    const wrappingRoot = events.find((event) => event.spanId === TRACE_ID);
    const generation = events.find(
      (event) => event.spanId === `${RUN_ID}-llm-0`,
    );

    expect(wrappingRoot?.traceName).toBe("agent-turn");
    expect(generation?.name).toBe("invoke-model");
    expect(generation?.traceName).toBeNull();
  });

  it("does not emit named trace-create rewrites from child spans", async () => {
    await publishFixture();

    const events = await processPublishedIngestionEvents();
    const namedTraceCreates = events.filter(
      (event) =>
        event.type === "trace-create" &&
        Boolean((event.body as { name?: string }).name),
    );

    expect(namedTraceCreates).toHaveLength(1);
    expect(namedTraceCreates[0]?.body).toMatchObject({
      id: TRACE_ID,
      name: "agent-turn",
    });
  });

  it("links the generation prompt as an integer version in legacy ingestion events", async () => {
    await publishFixture();

    const events = await processPublishedIngestionEvents();
    const generation = events.find(
      (event) => (event.body as { id?: string }).id === `${RUN_ID}-llm-0`,
    );

    const parsed = createIngestionEventSchema(false).safeParse(generation);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data?.body).toMatchObject({
      promptName: "in-app-agent-system",
      promptVersion: 3,
    });
  });

  it("skips an empty input", async () => {
    await publishAiFeatureTraceViaOtelIngestion({
      projectId: "project-1",
      eventInputs: [],
    });

    expect(publishToOtelIngestionQueue).not.toHaveBeenCalled();
  });
});
