import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TraceSinkParams } from "../types";
import { createAiSdkTelemetryCapture } from "./telemetry";

const publishToOtelIngestionQueue = vi.fn().mockResolvedValue(undefined);
const processorConstructor = vi.fn();

vi.mock("../../otel/OtelIngestionProcessor", () => ({
  OtelIngestionProcessor: class {
    constructor(config: unknown) {
      processorConstructor(config);
    }
    publishToOtelIngestionQueue = publishToOtelIngestionQueue;
  },
}));

const VALID_TRACE_ID = "0af7651916cd43dd8448eb211c80319c";

const traceSinkParams: TraceSinkParams = {
  targetProjectId: "project-1",
  traceId: VALID_TRACE_ID,
  traceName: "Execute evaluator: helpfulness",
  environment: "langfuse-llm-judge",
  userId: "user-1",
  metadata: { jobId: "job-1" },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createAiSdkTelemetryCapture", () => {
  it("refuses non-langfuse environments (eval-loop safeguard)", () => {
    expect(
      createAiSdkTelemetryCapture({
        traceSinkParams: { ...traceSinkParams, environment: "production" },
      }),
    ).toBeUndefined();
  });

  it("refuses invalid W3C trace ids", () => {
    expect(
      createAiSdkTelemetryCapture({
        traceSinkParams: { ...traceSinkParams, traceId: "not-a-trace-id" },
      }),
    ).toBeUndefined();

    expect(
      createAiSdkTelemetryCapture({
        traceSinkParams: { ...traceSinkParams, traceId: "0".repeat(32) },
      }),
    ).toBeUndefined();
  });

  it("publishes the root span with the Langfuse trace id and attributes", async () => {
    const capture = createAiSdkTelemetryCapture({
      traceSinkParams: {
        ...traceSinkParams,
        prompt: { name: "p", version: 3 },
      },
    });
    expect(capture).toBeDefined();

    await capture!.run(async () => "done");
    await capture!.flush();

    expect(processorConstructor).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        sdkName: "langfuse-internal-ai-sdk",
        // Ensures the queue consumer parses these events with the internal
        // ingestion schema; the public schema strips the "langfuse-"
        // environment prefix and would bypass the eval-loop guard.
        isLangfuseInternal: true,
        // Ensures the direct events write runs, which is the only path that
        // materializes langfuse.experiment.* into experiment_* columns.
        ingestionVersion: "4",
      }),
    );
    expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);

    const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];
    const spans = resourceSpans.flatMap((rs: any) =>
      rs.scopeSpans.flatMap((ss: any) => ss.spans),
    );
    expect(spans).toHaveLength(1);

    const rootSpan = spans[0];
    expect(rootSpan.traceId.toLowerCase()).toBe(VALID_TRACE_ID);
    expect(rootSpan.name).toBe("Execute evaluator: helpfulness");
    expect(rootSpan.parentSpanId ?? "").toBe("");

    const attributes = Object.fromEntries(
      rootSpan.attributes.map((attr: any) => [
        attr.key,
        attr.value.stringValue ?? attr.value,
      ]),
    );
    expect(attributes["langfuse.environment"]).toBe("langfuse-llm-judge");
    expect(attributes["langfuse.trace.name"]).toBe(
      "Execute evaluator: helpfulness",
    );
    expect(attributes["user.id"]).toBe("user-1");
    expect(attributes["langfuse.trace.metadata"]).toBe(
      JSON.stringify({ jobId: "job-1" }),
    );
  });

  it("is idempotent and never publishes twice", async () => {
    const capture = createAiSdkTelemetryCapture({
      traceSinkParams,
    });

    await capture!.flush();
    await capture!.flush();

    expect(publishToOtelIngestionQueue).toHaveBeenCalledTimes(1);
  });

  it("never throws when publishing fails", async () => {
    publishToOtelIngestionQueue.mockRejectedValueOnce(new Error("queue down"));

    const capture = createAiSdkTelemetryCapture({
      traceSinkParams,
    });

    await expect(capture!.flush()).resolves.toBeUndefined();
  });

  it("records the provider response model when it differs from the requested model", async () => {
    const capture = createAiSdkTelemetryCapture({ traceSinkParams });
    const integration = (capture!.telemetry as any).integrations[0];

    integration.onLanguageModelCallStart({
      callId: "call-1",
      provider: "openai",
      modelId: "gpt-4o",
    } as any);
    integration.onLanguageModelCallEnd({
      callId: "call-1",
      provider: "openai",
      // OpenAI resolves the alias to a dated snapshot in its response.
      modelId: "gpt-4o-2024-08-06",
      finishReason: { unified: "stop", raw: "stop" },
      usage: { inputTokens: 3, outputTokens: 5, totalTokens: 8 },
      content: [{ type: "text", text: "answer" }],
      responseId: "resp-1",
    } as any);

    await capture!.flush();

    const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];
    const spans = resourceSpans.flatMap((rs: any) =>
      rs.scopeSpans.flatMap((ss: any) => ss.spans),
    );
    const generationSpan = spans.find((span: any) =>
      span.attributes.some(
        (attribute: any) => attribute.key === "gen_ai.operation.name",
      ),
    );
    expect(generationSpan).toBeDefined();

    const attributes = Object.fromEntries(
      generationSpan.attributes.map((attribute: any) => [
        attribute.key,
        attribute.value.stringValue ?? attribute.value,
      ]),
    );
    expect(attributes["gen_ai.request.model"]).toBe("gpt-4o");
    expect(attributes["gen_ai.response.model"]).toBe("gpt-4o-2024-08-06");
  });

  it("marks the root span as errored via setRootError", async () => {
    const capture = createAiSdkTelemetryCapture({
      traceSinkParams,
    });

    capture!.setRootError(new Error("completion failed"));
    await capture!.flush();

    const resourceSpans = publishToOtelIngestionQueue.mock.calls[0][0];
    const rootSpan = resourceSpans[0].scopeSpans[0].spans[0];

    // OTLP JSON status code 2 = ERROR
    expect(rootSpan.status).toMatchObject({
      code: 2,
      message: "completion failed",
    });
    expect(
      Object.fromEntries(
        rootSpan.attributes.map((attribute: any) => [
          attribute.key,
          attribute.value.stringValue ?? attribute.value,
        ]),
      ),
    ).toMatchObject({ "error.type": "Error" });
  });
});
