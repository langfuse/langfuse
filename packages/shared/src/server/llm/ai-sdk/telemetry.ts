import { randomBytes } from "node:crypto";

import type { Telemetry } from "ai";

import {
  type Attributes,
  type Tracer,
  context,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
  type Span,
} from "@opentelemetry/api";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
} from "@opentelemetry/sdk-trace-base";
import type { TelemetryOptions } from "ai";

import { stringifyValue } from "../../../utils/stringChecks";
import { traceException } from "../../instrumentation";
import { logger } from "../../logger";
import { LangfuseOtelSpanAttributes } from "../../otel/attributes";
import { publishInternalOtelSpans } from "../../otel/internalTraceOtelWriter";
import type { InternalTraceExperimentContext } from "../internalTraceEvents";
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
   * Records the completion result as the root span's (and trace's) output.
   * Call before `flush`. The root observation's input/output feed eval
   * variable mapping for experiment run items.
   */
  setRootOutput: (output: unknown) => void;
  /**
   * Marks the root span (and thus the internal trace) as failed. Call before
   * `flush`, so a failed completion is visible as an ERROR-level root
   * observation instead of a bare 0-duration span.
   */
  setRootError: (error: unknown) => void;
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
 * For experiment run items (`eventsWriter.experimentContext` present), the
 * `langfuse.experiment.*` attributes are set on every captured span with the
 * root span as `experiment_item_root_observation_id`, so the OTel ingestion
 * pipeline materializes the linkage required for queue-side scheduling of
 * experiment observation evals.
 *
 * Returns `undefined` (no tracing) when the environment is not
 * langfuse-prefixed (the eval-loop safeguard) or when the trace ID is not a
 * valid W3C trace ID.
 */
export function createAiSdkTelemetryCapture(params: {
  traceSinkParams: TraceSinkParams;
  /** Recorded as the root span's (and trace's) input. */
  rootInput?: unknown;
}): AiSdkTelemetryCapture | undefined {
  const { traceSinkParams, rootInput } = params;

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

  const serializedInput =
    rootInput !== undefined ? stringifyValue(rootInput) : undefined;

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
        ...(serializedInput !== undefined
          ? {
              [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: serializedInput,
            }
          : {}),
      },
    },
    // ROOT_CONTEXT detaches from the server's own observability trace.
    ROOT_CONTEXT,
  );
  const activeContext = trace.setSpan(ROOT_CONTEXT, rootSpan);

  const experimentContext = traceSinkParams.eventsWriter?.experimentContext;
  const experimentAttributes = experimentContext
    ? buildExperimentAttributes(
        experimentContext,
        rootSpan.spanContext().spanId,
      )
    : undefined;
  if (experimentAttributes) {
    rootSpan.setAttributes(experimentAttributes);
  }

  const promptAttributes = traceSinkParams.prompt
    ? {
        // Link the LLM generation spans to the resolved Langfuse prompt.
        [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]:
          traceSinkParams.prompt.name,
        [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
          traceSinkParams.prompt.version,
      }
    : undefined;

  const otelIntegration = createGenerationSpanTelemetry({
    tracer,
    attributes: {
      // Experiment linkage goes on every span so every materialized event
      // remains associated with the run item root.
      ...(experimentAttributes ?? {}),
      ...(promptAttributes ?? {}),
      [LangfuseOtelSpanAttributes.TRACE_NAME]: traceSinkParams.traceName,
      [LangfuseOtelSpanAttributes.ENVIRONMENT]: traceSinkParams.environment,
      ...(traceSinkParams.userId
        ? {
            [LangfuseOtelSpanAttributes.TRACE_USER_ID]: traceSinkParams.userId,
          }
        : {}),
    },
  });

  let flushed = false;

  const setRootOutput = (output: unknown): void => {
    if (flushed || output === undefined) return;
    const serializedOutput = stringifyValue(output);

    rootSpan.setAttribute(
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      serializedOutput,
    );
  };

  const setRootError = (error: unknown): void => {
    if (flushed) return;
    rootSpan.setAttribute("error.type", getErrorType(error));
    rootSpan.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : String(error),
    });
    if (error instanceof Error) rootSpan.recordException(error);
  };

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

      await publishInternalOtelSpans({
        spans: matchingSpans,
        projectId: traceSinkParams.targetProjectId,
        sdkName: INTERNAL_SDK_NAME,
      });
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
    setRootOutput,
    setRootError,
    flush,
  };
}

/**
 * Minimal AI SDK telemetry integration for Langfuse-internal LLM completions.
 */
export function createGenerationSpanTelemetry(params: {
  tracer: Tracer;
  /**
   * Extra attributes for every generation span (Langfuse prompt link,
   * experiment linkage).
   */
  attributes?: Attributes;
}): Telemetry {
  const { tracer, attributes } = params;
  const openSpans = new Map<string, Span>();

  const endAllOpenSpans = (error?: unknown): void => {
    for (const span of openSpans.values()) {
      if (error !== undefined) {
        span.setAttribute("error.type", getErrorType(error));
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.message : String(error),
        });

        if (error instanceof Error) span.recordException(error);
      }
      span.end();
    }
    openSpans.clear();
  };

  return {
    onLanguageModelCallStart(event) {
      // Defensive: a lingering span for this call id means its end event never
      // fired (e.g. a retried attempt) — close it before starting the next.
      openSpans.get(event.callId)?.end();

      const span = tracer.startSpan(
        `chat ${event.modelId}`,
        {
          kind: SpanKind.CLIENT,
          attributes: {
            "gen_ai.operation.name": "chat",
            "gen_ai.provider.name": event.provider,
            "gen_ai.request.model": event.modelId,
            ...definedNumberAttributes({
              "gen_ai.request.max_tokens": event.maxOutputTokens,
              "gen_ai.request.temperature": event.temperature,
              "gen_ai.request.top_p": event.topP,
            }),
            ...(event.messages !== undefined
              ? { "gen_ai.input.messages": safeJsonStringify(event.messages) }
              : {}),
            ...(event.tools && event.tools.length > 0
              ? { "gen_ai.tool.definitions": safeJsonStringify(event.tools) }
              : {}),
            ...attributes,
          },
        },
        context.active(),
      );

      openSpans.set(event.callId, span);
    },

    onLanguageModelCallEnd(event) {
      const span = openSpans.get(event.callId);

      if (!span) return;

      openSpans.delete(event.callId);

      span.setAttributes({
        "gen_ai.response.finish_reasons": [event.finishReason],
        ...(event.responseId ? { "gen_ai.response.id": event.responseId } : {}),
        ...definedNumberAttributes({
          "gen_ai.usage.input_tokens": event.usage.inputTokens,
          "gen_ai.usage.output_tokens": event.usage.outputTokens,
          "gen_ai.usage.cache_read.input_tokens":
            event.usage.inputTokenDetails?.cacheReadTokens,
          "gen_ai.usage.cache_creation.input_tokens":
            event.usage.inputTokenDetails?.cacheWriteTokens,
        }),
        "gen_ai.output.messages": safeJsonStringify([
          { role: "assistant", content: event.content },
        ]),
      });
      span.end();
    },

    onError(event) {
      endAllOpenSpans(getTelemetryError(event));
    },

    onAbort() {
      endAllOpenSpans();
    },

    // Run the provider call with the generation span active, so any future
    // nested instrumentation parents correctly.
    executeLanguageModelCall({ callId, execute }) {
      const span = openSpans.get(callId);
      if (!span) return execute();

      return context.with(trace.setSpan(context.active(), span), execute);
    },
  };
}

function definedNumberAttributes(
  attributes: Record<string, number | undefined>,
): Attributes {
  return Object.fromEntries(
    Object.entries(attributes).filter(([, value]) => value !== undefined),
  ) as Attributes;
}

function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "[Unserializable content]";
  }
}

function getErrorType(error: unknown): string {
  if (
    error !== null &&
    typeof error === "object" &&
    "name" in error &&
    typeof error.name === "string" &&
    error.name.length > 0
  ) {
    return error.name;
  }

  return "_OTHER";
}

function getTelemetryError(event: unknown): unknown {
  return event !== null && typeof event === "object" && "error" in event
    ? event.error
    : event;
}
/**
 * Maps the internal experiment context to the `langfuse.experiment.*` span
 * attributes that `OtelIngestionProcessor.extractExperimentFields` reads to
 * produce experiment-linked event records.
 */
function buildExperimentAttributes(
  experimentContext: InternalTraceExperimentContext,
  rootSpanId: string,
): Record<string, string> {
  return {
    [LangfuseOtelSpanAttributes.EXPERIMENT_ID]: experimentContext.id,
    [LangfuseOtelSpanAttributes.EXPERIMENT_NAME]: experimentContext.name,
    [LangfuseOtelSpanAttributes.EXPERIMENT_DATASET_ID]:
      experimentContext.datasetId,
    [LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_ID]: experimentContext.itemId,
    [LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_VERSION]:
      experimentContext.itemVersion,
    [LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_ROOT_OBSERVATION_ID]:
      rootSpanId,
    ...(experimentContext.description
      ? {
          [LangfuseOtelSpanAttributes.EXPERIMENT_DESCRIPTION]:
            experimentContext.description,
        }
      : {}),
    ...(experimentContext.itemExpectedOutput !== undefined &&
    experimentContext.itemExpectedOutput !== null
      ? {
          [LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_EXPECTED_OUTPUT]:
            stringifyValue(experimentContext.itemExpectedOutput),
        }
      : {}),
    ...(experimentContext.metadata
      ? {
          [LangfuseOtelSpanAttributes.EXPERIMENT_METADATA]: JSON.stringify(
            experimentContext.metadata,
          ),
        }
      : {}),
    ...(experimentContext.itemMetadata
      ? {
          [LangfuseOtelSpanAttributes.EXPERIMENT_ITEM_METADATA]: JSON.stringify(
            experimentContext.itemMetadata,
          ),
        }
      : {}),
  };
}
