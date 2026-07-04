import { randomBytes } from "crypto";

import {
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  isValidTraceId,
  trace,
  type Attributes,
  type Exception,
  type Span,
  type SpanContext,
} from "@opentelemetry/api";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { OpenTelemetry } from "@ai-sdk/otel";
import type { TelemetryOptions } from "ai";

import { logger } from "../../logger";
import { traceException } from "../../instrumentation";
import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "../../otel/OtelIngestionProcessor";
import { LangfuseOtelSpanAttributes } from "../../otel/attributes";
import type { TraceSinkParams } from "../types";
import type {
  AiSdkRootSpanAttributes,
  AiSdkTelemetryContext,
  AiSdkTelemetryScope,
} from "./types";

export function createAiSdkTelemetryContext(params: {
  traceSinkParams?: TraceSinkParams;
  rootSpanAttributes: AiSdkRootSpanAttributes;
}): AiSdkTelemetryContext {
  const { traceSinkParams, rootSpanAttributes } = params;

  if (!traceSinkParams) {
    return createNoopTelemetryContext();
  }

  if (!traceSinkParams.environment?.startsWith("langfuse")) {
    logger.warn(
      "Skipping AI SDK trace creation: internal traces must use LangfuseInternalTraceEnvironment enum",
      {
        environment: traceSinkParams.environment,
        traceId: traceSinkParams.traceId,
      },
    );
    return createNoopTelemetryContext();
  }

  if (!isValidTraceId(traceSinkParams.traceId)) {
    logger.warn("Skipping AI SDK trace creation: invalid W3C trace id", {
      traceId: traceSinkParams.traceId,
      projectId: traceSinkParams.targetProjectId,
    });
    return createNoopTelemetryContext();
  }

  const exporter = new InMemorySpanExporter();
  const tracerProvider = new BasicTracerProvider({
    spanProcessors: [new SimpleSpanProcessor(exporter)],
  });
  const tracer = tracerProvider.getTracer("langfuse-ai-sdk-executor", "1");
  const parentContext = trace.setSpanContext(
    ROOT_CONTEXT,
    createRemoteParentSpanContext(traceSinkParams.traceId),
  );

  const telemetry: TelemetryOptions = {
    isEnabled: true,
    recordInputs: true,
    recordOutputs: true,
    functionId: "fetchLLMCompletion",
    integrations: [
      new OpenTelemetry({
        tracer,
        usage: true,
        providerMetadata: true,
        toolChoice: true,
        schema: true,
        enrichSpan: () => ({
          "llm.execution_engine": "ai-sdk",
          "llm.ai_sdk.adapter": rootSpanAttributes.adapter,
          "llm.openai.api_mode": rootSpanAttributes.apiMode,
        }),
      }),
    ],
  };

  return {
    telemetry,
    startScope: () =>
      createTelemetryScope({
        tracer,
        parentContext,
        traceSinkParams,
        rootSpanAttributes,
      }),
    flushAndPublish: async () => {
      try {
        await tracerProvider.forceFlush();
        const finishedSpans = exporter.getFinishedSpans();
        if (finishedSpans.length === 0) return;

        const resourceSpans =
          serializeReadableSpansToResourceSpans(finishedSpans);
        if (resourceSpans.length === 0) return;

        await new OtelIngestionProcessor({
          projectId: traceSinkParams.targetProjectId,
          publicKey: "",
          sdkName: "ai-sdk",
          sdkVersion: "7",
          ingestionVersion: "4",
        }).publishToOtelIngestionQueue(resourceSpans);
      } catch (error) {
        logger.error("Failed to publish AI SDK telemetry to OTEL ingestion", {
          error,
          traceId: traceSinkParams.traceId,
          projectId: traceSinkParams.targetProjectId,
        });
        traceException(error);
      }
    },
  };
}

function createNoopTelemetryContext(): AiSdkTelemetryContext {
  return {
    startScope: () => ({
      run: (operation) => operation(),
      end: () => undefined,
    }),
    flushAndPublish: () => Promise.resolve(),
  };
}

function createTelemetryScope(params: {
  tracer: ReturnType<BasicTracerProvider["getTracer"]>;
  parentContext: ReturnType<typeof trace.setSpanContext>;
  traceSinkParams: TraceSinkParams;
  rootSpanAttributes: AiSdkRootSpanAttributes;
}): AiSdkTelemetryScope {
  const { tracer, parentContext, traceSinkParams, rootSpanAttributes } = params;
  const span = tracer.startSpan(
    traceSinkParams.traceName,
    {
      kind: SpanKind.INTERNAL,
      attributes: buildRootSpanAttributes(traceSinkParams, rootSpanAttributes),
    },
    parentContext,
  );
  const activeContext = trace.setSpan(parentContext, span);
  let ended = false;

  return {
    run: (operation) => context.with(activeContext, operation),
    end: (error?: unknown) => {
      if (ended) return;
      ended = true;
      endScope(span, error);
    },
  };
}

function endScope(span: Span, error?: unknown): void {
  if (error) {
    span.recordException(toOtelException(error));
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
  } else {
    span.setStatus({ code: SpanStatusCode.OK });
  }
  span.end();
}

function toOtelException(error: unknown): Exception {
  return error instanceof Error ? error : String(error);
}

function buildRootSpanAttributes(
  traceSinkParams: TraceSinkParams,
  rootSpanAttributes: AiSdkRootSpanAttributes,
): Attributes {
  const attributes: Attributes = {
    [LangfuseOtelSpanAttributes.TRACE_NAME]: traceSinkParams.traceName,
    [LangfuseOtelSpanAttributes.ENVIRONMENT]: traceSinkParams.environment,
    [LangfuseOtelSpanAttributes.AS_ROOT]: "true",
    "llm.execution_engine": "ai-sdk",
    "llm.ai_sdk.adapter": rootSpanAttributes.adapter,
    "llm.openai.api_mode": rootSpanAttributes.apiMode,
  };

  if (traceSinkParams.userId) {
    attributes[LangfuseOtelSpanAttributes.TRACE_USER_ID] =
      traceSinkParams.userId;
  }
  if (traceSinkParams.metadata) {
    attributes[LangfuseOtelSpanAttributes.TRACE_METADATA] = JSON.stringify(
      traceSinkParams.metadata,
    );
  }
  if (traceSinkParams.prompt) {
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME] =
      traceSinkParams.prompt.name;
    attributes[LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION] =
      traceSinkParams.prompt.version;
  }

  return attributes;
}

function createRemoteParentSpanContext(traceId: string): SpanContext {
  return {
    traceId,
    spanId: randomSpanId(),
    isRemote: true,
    traceFlags: TraceFlags.SAMPLED,
  };
}

function randomSpanId(): string {
  let spanId = "";
  do {
    spanId = randomBytes(8).toString("hex");
  } while (spanId === "0000000000000000");
  return spanId;
}

function serializeReadableSpansToResourceSpans(
  spans: ReadableSpan[],
): ResourceSpan[] {
  const serialized = JsonTraceSerializer.serializeRequest(spans);
  const decoded = JSON.parse(new TextDecoder().decode(serialized)) as {
    resourceSpans?: ResourceSpan[];
  };

  return decoded.resourceSpans ?? [];
}
