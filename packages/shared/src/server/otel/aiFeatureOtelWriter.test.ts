import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildInternalTraceEventInputs } from "../llm/internalTraceEvents";
import {
  AI_FEATURE_OTEL_SDK_NAME,
  publishAiFeatureTraceViaOtelIngestion,
} from "./aiFeatureOtelWriter";

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
      startTime: START_ISO,
      endTime: END_ISO,
      model: "claude-opus",
      usageDetails: { input: 10, output: 5, total: 15 },
    },
  },
];

const processPublishedSpans = async () => {
  expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
  const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];

  const { OtelIngestionProcessor } = await vi.importActual<
    typeof import("./OtelIngestionProcessor")
  >("./OtelIngestionProcessor");
  return new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "",
    sdkName: AI_FEATURE_OTEL_SDK_NAME,
    sdkVersion: "unknown",
    ingestionVersion: "4",
    isLangfuseInternal: false,
  }).processToEvent(resourceSpans);
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("publishAiFeatureTraceViaOtelIngestion", () => {
  it("preserves agent and tool observation types from SDK event types", async () => {
    const { eventInputs } = buildInternalTraceEventInputs({
      processedEvents,
      traceId: TRACE_ID,
      projectId: "project-1",
    });

    await publishAiFeatureTraceViaOtelIngestion({
      projectId: "project-1",
      eventInputs,
    });

    expect(processorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        ingestionVersion: "4",
        isLangfuseInternal: false,
        sdkName: AI_FEATURE_OTEL_SDK_NAME,
      }),
    );

    const events = await processPublishedSpans();
    expect(events).toHaveLength(3);

    const root = events.find((event) => event.spanId === RUN_ID);
    const tool = events.find((event) => event.spanId === "tool-call-1");
    const generation = events.find(
      (event) => event.spanId === `${RUN_ID}-llm-0`,
    );

    expect(root).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: null,
      name: "agent-turn",
      type: "AGENT",
      environment: "production",
      userId: "user-1",
      sessionId: "conversation-1",
    });
    expect(root?.tags).toEqual(["in-app-agent"]);
    expect(tool).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: RUN_ID,
      name: "langfuse_listPrompts",
      type: "TOOL",
      environment: "production",
    });
    expect(generation).toMatchObject({
      traceId: TRACE_ID,
      parentSpanId: RUN_ID,
      name: "invoke-model",
      type: "GENERATION",
      environment: "production",
      modelName: "claude-opus",
    });
    expect(generation?.providedUsageDetails).toMatchObject({
      input: 10,
      output: 5,
      total: 15,
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
