import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  writeInternalTraceViaOtelIngestion,
  type InternalOtelSpanInput,
} from "./internalTraceOtelWriter";

const publishToOtelIngestionQueue = vi.fn().mockResolvedValue(undefined);

vi.mock("./OtelIngestionProcessor", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("./OtelIngestionProcessor")>();
  return {
    ...actual,
    OtelIngestionProcessor: class {
      publishToOtelIngestionQueue = publishToOtelIngestionQueue;
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
