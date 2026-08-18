import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  publishInternalTraceInputsViaOtelIngestion,
  writeInternalTraceViaOtelIngestion,
  type InternalOtelSpanInput,
} from "./internalTraceOtelWriter";

const publishToOtelIngestionQueue = vi.fn().mockResolvedValue(undefined);
let processorConfig: Record<string, unknown> | undefined;

vi.mock("./OtelIngestionProcessor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./OtelIngestionProcessor")>();
  return {
    ...actual,
    OtelIngestionProcessor: class {
      publishToOtelIngestionQueue = publishToOtelIngestionQueue;

      constructor(config: Record<string, unknown>) {
        processorConfig = config;
      }
    },
  };
});

const TRACE_ID = "0af7651916cd43dd8448eb211c80319c";
const START_ISO = "2026-07-09T14:10:41.143Z";
const END_ISO = "2026-07-09T14:10:42.000Z";

// Mirrors the shape buildCodeEvalTraceInput (codeEvalExecution.ts) produces:
// a single finished root span whose spanId is the 32-hex trace ID.
const codeEvalRootInput: InternalOtelSpanInput = {
  projectId: "project-1",
  traceId: TRACE_ID,
  spanId: TRACE_ID,
  startTimeISO: START_ISO,
  endTimeISO: END_ISO,
  name: "Execute evaluator: helpfulness",
  traceName: "Execute evaluator: helpfulness",
  environment: "langfuse-code-eval",
  level: "ERROR",
  statusMessage: "Code eval execution failed: boom",
  input: '{"item":{}}',
  output: '{"error":"boom"}',
  metadata: { dispatcher_name: "test-dispatcher" },
};

// Convert the published OTLP payload through the REAL OTel ingestion
// processor — the same code path the OTel ingestion queue runs — so a
// regression in attribute naming or the internal-schema contract fails here
// instead of only in production.
const processPublishedSpans = async () => {
  expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
  const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];

  const { OtelIngestionProcessor } = await vi.importActual<
    typeof import("./OtelIngestionProcessor")
  >("./OtelIngestionProcessor");
  return new OtelIngestionProcessor({
    projectId: "project-1",
    publicKey: "",
    sdkName: "langfuse-internal-otel-writer",
    sdkVersion: "unknown",
    isLangfuseInternal: true,
  }).processToEvent(resourceSpans);
};

beforeEach(() => {
  vi.clearAllMocks();
  processorConfig = undefined;
});

describe("writeInternalTraceViaOtelIngestion", () => {
  it("publishes a trace that converts through the real OTel ingestion processor", async () => {
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: TRACE_ID,
      eventInputs: [codeEvalRootInput],
    });

    const events = await processPublishedSpans();
    expect(events).toHaveLength(1);

    const root = events[0];
    expect(root.traceId).toBe(TRACE_ID);
    expect(root.parentSpanId).toBeNull();
    expect(root).toMatchObject({
      name: "Execute evaluator: helpfulness",
      traceName: "Execute evaluator: helpfulness",
      // The langfuse- prefix must survive conversion; stripping it would
      // bypass the trace-upsert eval-loop guard.
      environment: "langfuse-code-eval",
      level: "ERROR",
      statusMessage: "Code eval execution failed: boom",
      input: '{"item":{}}',
      output: '{"error":"boom"}',
      startTimeISO: START_ISO,
      endTimeISO: END_ISO,
    });
    expect(root.metadata).toMatchObject({
      dispatcher_name: "test-dispatcher",
    });
  });

  it("remaps child parentSpanId onto the regenerated span ids", async () => {
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: TRACE_ID,
      eventInputs: [
        codeEvalRootInput,
        {
          ...codeEvalRootInput,
          spanId: "original-child-id",
          // References the root's ORIGINAL spanId (the 32-hex trace id, not a
          // valid OTel span id) — must resolve to the root's generated id.
          parentSpanId: codeEvalRootInput.spanId,
          name: "child step",
        },
      ],
    });

    const events = await processPublishedSpans();
    expect(events).toHaveLength(2);

    const root = events.find((e: any) => !e.parentSpanId);
    const child = events.find((e: any) => e.parentSpanId);
    expect(child.name).toBe("child step");
    expect(child.traceId).toBe(TRACE_ID);
    expect(child.parentSpanId).toBe(root.spanId);
    // Trace-level fields stay on the root only.
    expect(child.traceName).toBeNull();

    // A parent that no preceding input declared cannot be linked once span
    // ids are regenerated — refused instead of emitting broken linkage.
    await expect(
      writeInternalTraceViaOtelIngestion({
        rootSpanId: TRACE_ID,
        eventInputs: [
          { ...codeEvalRootInput, parentSpanId: "unknown-span-id" },
        ],
      }),
    ).rejects.toThrow(/parentSpanId/);
  });

  it("skips empty, non-langfuse-environment, and invalid-trace-id inputs", async () => {
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: TRACE_ID,
      eventInputs: [],
    });
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: TRACE_ID,
      eventInputs: [{ ...codeEvalRootInput, environment: "production" }],
    });
    await writeInternalTraceViaOtelIngestion({
      rootSpanId: "not-a-trace-id",
      eventInputs: [{ ...codeEvalRootInput, traceId: "not-a-trace-id" }],
    });

    expect(publishToOtelIngestionQueue).not.toHaveBeenCalled();
  });
});

describe("publishInternalTraceInputsViaOtelIngestion", () => {
  it("preserves in-app trace and observation IDs through the real OTel converter", async () => {
    const inAppTraceId = "arun_run-123-trace";
    const rootObservationId = "arun_run-123";
    const generationId = "arun_run-123-llm-1";

    await publishInternalTraceInputsViaOtelIngestion({
      projectId: "project-1",
      eventInputs: [
        {
          projectId: "project-1",
          traceId: inAppTraceId,
          spanId: rootObservationId,
          startTimeISO: START_ISO,
          endTimeISO: END_ISO,
          name: "agent-turn",
          type: "SPAN",
          environment: "langfuse-in-app-agent",
          traceName: "agent-turn",
          level: "ERROR",
          statusMessage: "agent failed",
          userId: "user-1",
          sessionId: "conversation-1",
          tags: ["in-app-agent"],
          metadata: { feature: "assistant" },
          input: '{"messages":[]}',
          output: '{"text":"hello"}',
          source: "in-app-agent",
        },
        {
          projectId: "project-1",
          traceId: inAppTraceId,
          spanId: generationId,
          parentSpanId: rootObservationId,
          startTimeISO: START_ISO,
          endTimeISO: END_ISO,
          name: "invoke-model",
          type: "GENERATION",
          environment: "langfuse-in-app-agent",
          metadata: {},
          modelName: "claude-test",
          modelParameters: { temperature: 0.2 },
          providedUsageDetails: { input: 10, output: 5, total: 15 },
          providedCostDetails: { input: 0.01, output: 0.02, total: 0.03 },
          promptName: "assistant-prompt",
          promptVersion: "3",
          completionStartTime: START_ISO,
          input: '{"messages":[]}',
          output: '{"text":"hello"}',
          source: "in-app-agent",
        },
      ],
    });

    expect(processorConfig).toMatchObject({
      ingestionVersion: "4",
      isLangfuseInternal: true,
    });

    const events = await processPublishedSpans();
    const root = events.find(
      (event: any) => event.spanId === rootObservationId,
    );
    const generation = events.find(
      (event: any) => event.spanId === generationId,
    );

    expect(root).toMatchObject({
      traceId: inAppTraceId,
      spanId: rootObservationId,
      parentSpanId: null,
      traceName: "agent-turn",
      userId: "user-1",
      sessionId: "conversation-1",
      environment: "langfuse-in-app-agent",
      level: "ERROR",
      statusMessage: "agent failed",
      input: '{"messages":[]}',
      output: '{"text":"hello"}',
      startTimeISO: START_ISO,
      endTimeISO: END_ISO,
    });
    expect(root.metadata).toMatchObject({ feature: "assistant" });
    expect(generation).toMatchObject({
      traceId: inAppTraceId,
      spanId: generationId,
      parentSpanId: rootObservationId,
      modelName: "claude-test",
      modelParameters: { temperature: 0.2 },
      promptName: "assistant-prompt",
      promptVersion: "3",
      providedUsageDetails: { input: 10, output: 5, total: 15 },
      providedCostDetails: { input: 0.01, output: 0.02, total: 0.03 },
      input: '{"messages":[]}',
      output: '{"text":"hello"}',
      startTimeISO: START_ISO,
      endTimeISO: END_ISO,
      completionStartTime: START_ISO,
    });
  });
});
