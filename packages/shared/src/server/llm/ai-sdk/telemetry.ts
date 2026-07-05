import { randomBytes } from "node:crypto";

import { context, ROOT_CONTEXT, trace, type Span } from "@opentelemetry/api";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import { OpenTelemetry } from "@ai-sdk/otel";
import type { TelemetryOptions } from "ai";

import { traceException } from "../../instrumentation";
import { logger } from "../../logger";
import { LangfuseOtelSpanAttributes } from "../../otel/attributes";
import { OtelIngestionProcessor } from "../../otel/OtelIngestionProcessor";
import type { TraceSinkParams } from "../types";

const W3C_TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;
const INTERNAL_SDK_NAME = "langfuse-internal-ai-sdk";
const INTERNAL_TRACER_SCOPE = "langfuse-internal-llm-completion";

export type AiSdkTelemetryCapture = {
  /** Pass to `generateText`/`streamText` as the `telemetry` option. */
  telemetry: TelemetryOptions;
  /**
   * Runs `fn` with the internal root span active, so AI SDK telemetry spans
   * nest under it. Requires a registered OTel context manager for propagation
   * across awaits (present in web and worker runtimes).
   */
  run: <T>(fn: () => T) => T;
  /**
   * Ends the root span and publishes all captured spans to the regular OTel
   * ingestion pipeline (same S3 + queue path as the public
   * /api/public/otel/v1/traces endpoint). Idempotent; never throws.
   */
  flush: () => Promise<void>;
};

/**
 * Per-call isolated OTel capture for AI SDK executions.
 *
 * A dedicated `BasicTracerProvider` (never globally registered) buffers spans
 * in memory. Its id generator returns `traceSinkParams.traceId` for root
 * spans, so the internal root span carries the Langfuse trace ID without any
 * span rewriting, and all child spans inherit it via context. After the call,
 * spans are serialized to OTLP JSON and submitted through
 * `OtelIngestionProcessor.publishToOtelIngestionQueue` — internal traces get
 * exactly the same ingestion treatment as user traces.
 *
 * Returns `undefined` (no tracing) when the environment is not
 * langfuse-prefixed — the same eval-loop safeguard as the LangChain path —
 * or when the trace ID is not a valid W3C trace ID.
 */
export function createAiSdkTelemetryCapture(params: {
  traceSinkParams: TraceSinkParams;
  attribution: Record<string, string>;
}): AiSdkTelemetryCapture | undefined {
  const { traceSinkParams, attribution } = params;

  // Safeguard: All internal traces must use LangfuseInternalTraceEnvironment enum values
  // This prevents infinite eval loops (user trace → eval → eval trace → another eval)
  // See corresponding check in worker/src/features/evaluation/evalService.ts createEvalJobs()
  if (!traceSinkParams.environment?.startsWith("langfuse")) {
    logger.warn(
      "Skipping trace creation: internal traces must use LangfuseInternalTraceEnvironment enum",
      {
        environment: traceSinkParams.environment,
        traceId: traceSinkParams.traceId,
      },
    );
    return undefined;
  }

  const traceId = traceSinkParams.traceId.toLowerCase();
  if (!W3C_TRACE_ID_PATTERN.test(traceId) || traceId === "0".repeat(32)) {
    logger.warn(
      "Skipping trace creation: trace id is not a valid W3C trace id",
      { traceId: traceSinkParams.traceId },
    );
    return undefined;
  }

  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    // The environment must reach every captured span (not just the root), or
    // the resulting observations fall back to the "default" environment and
    // leak into user-facing views.
    resource: resourceFromAttributes({
      [LangfuseOtelSpanAttributes.ENVIRONMENT]: traceSinkParams.environment,
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    // Root spans (no parent in context) receive the Langfuse trace ID; child
    // spans inherit it through context propagation.
    idGenerator: {
      generateTraceId: () => traceId,
      generateSpanId: () => randomBytes(8).toString("hex"),
    },
  });
  const tracer = tracerProvider.getTracer(INTERNAL_TRACER_SCOPE);

  const rootSpan: Span = tracer.startSpan(
    traceSinkParams.traceName,
    {
      attributes: {
        [LangfuseOtelSpanAttributes.TRACE_NAME]: traceSinkParams.traceName,
        [LangfuseOtelSpanAttributes.ENVIRONMENT]: traceSinkParams.environment,
        ...(traceSinkParams.userId
          ? {
              [LangfuseOtelSpanAttributes.TRACE_USER_ID]:
                traceSinkParams.userId,
            }
          : {}),
        ...(traceSinkParams.metadata
          ? {
              [LangfuseOtelSpanAttributes.TRACE_METADATA]: JSON.stringify(
                traceSinkParams.metadata,
              ),
            }
          : {}),
        ...attribution,
      },
    },
    // ROOT_CONTEXT detaches from the server's own observability trace.
    ROOT_CONTEXT,
  );
  const activeContext = trace.setSpan(ROOT_CONTEXT, rootSpan);

  const otelIntegration = new OpenTelemetry({
    tracer,
    usage: true,
    ...(traceSinkParams.prompt
      ? {
          // Link the LLM generation spans to the resolved Langfuse prompt,
          // mirroring prepareInternalTraceEvents on the LangChain path.
          enrichSpan: ({ spanType }: { spanType: string }) =>
            spanType === "languageModel"
              ? {
                  [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]:
                    traceSinkParams.prompt!.name,
                  [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
                    traceSinkParams.prompt!.version,
                }
              : undefined,
        }
      : {}),
  });

  let flushed = false;

  const flush = async (): Promise<void> => {
    if (flushed) return;
    flushed = true;

    try {
      rootSpan.end();
      await tracerProvider.forceFlush();

      const spans = exporter.getFinishedSpans();
      // Without a registered OTel context manager, AI SDK spans lose the
      // active root span and land on a random trace ID. Publish only spans on
      // the expected trace so nothing leaks into foreign traces.
      const matchingSpans = spans.filter(
        (span) => span.spanContext().traceId === traceId,
      );
      if (matchingSpans.length < spans.length) {
        logger.warn(
          "Dropping AI SDK telemetry spans outside the internal trace; is an OTel context manager registered?",
          {
            traceId,
            droppedSpans: spans.length - matchingSpans.length,
          },
        );
      }
      if (matchingSpans.length === 0) return;

      const serialized = JsonTraceSerializer.serializeRequest(matchingSpans);
      if (!serialized) return;
      const { resourceSpans } = JSON.parse(
        new TextDecoder().decode(serialized),
      );
      if (!resourceSpans || resourceSpans.length === 0) return;

      const processor = new OtelIngestionProcessor({
        projectId: traceSinkParams.targetProjectId,
        publicKey: "", // internal ingestion has no API key; mirrors internal event writes
        sdkName: INTERNAL_SDK_NAME,
        sdkVersion: "unknown",
      });
      await processor.publishToOtelIngestionQueue(resourceSpans);
    } catch (e) {
      traceException(e);
      logger.error("Failed to publish AI SDK internal telemetry", {
        error: e,
        traceId,
        projectId: traceSinkParams.targetProjectId,
      });
    } finally {
      await tracerProvider.shutdown().catch(() => undefined);
    }
  };

  return {
    telemetry: { isEnabled: true, integrations: [otelIntegration] },
    run: (fn) => context.with(activeContext, fn),
    flush,
  };
}
