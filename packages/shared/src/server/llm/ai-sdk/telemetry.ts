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

import { stringifyValue } from "../../../utils/stringChecks";
import { traceException } from "../../instrumentation";
import { logger } from "../../logger";
import { LangfuseOtelSpanAttributes } from "../../otel/attributes";
import { OtelIngestionProcessor } from "../../otel/OtelIngestionProcessor";
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
   * variable mapping for experiment run items, mirroring the root event
   * record of the LangChain internal-tracing path.
   */
  setRootOutput: (output: unknown) => void;
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
 * pipeline materializes the same experiment linkage as the LangChain path's
 * `buildInternalTraceEventInputs` — including queue-side scheduling of
 * experiment observation evals.
 *
 * Returns `undefined` (no tracing) when the environment is not
 * langfuse-prefixed — the same eval-loop safeguard as the LangChain path —
 * or when the trace ID is not a valid W3C trace ID.
 */
export function createAiSdkTelemetryCapture(params: {
  traceSinkParams: TraceSinkParams;
  attribution: Record<string, string>;
  /** Recorded as the root span's (and trace's) input. */
  rootInput?: unknown;
}): AiSdkTelemetryCapture | undefined {
  const { traceSinkParams, attribution, rootInput } = params;

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
              [LangfuseOtelSpanAttributes.TRACE_INPUT]: serializedInput,
              [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: serializedInput,
            }
          : {}),
        ...attribution,
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
        // Link the LLM generation spans to the resolved Langfuse prompt,
        // mirroring prepareInternalTraceEvents on the LangChain path.
        [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME]:
          traceSinkParams.prompt.name,
        [LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION]:
          traceSinkParams.prompt.version,
      }
    : undefined;

  const enrichSpan =
    experimentAttributes || promptAttributes
      ? ({ spanType }: { spanType: string }) => ({
          // Experiment linkage goes on every span, matching the LangChain
          // path where buildInternalTraceEventInputs tags all event records.
          ...(experimentAttributes ?? {}),
          ...(spanType === "languageModel" ? (promptAttributes ?? {}) : {}),
        })
      : undefined;

  const otelIntegration = new OpenTelemetry({
    tracer,
    usage: true,
    ...(enrichSpan ? { enrichSpan } : {}),
  });

  let flushed = false;

  const setRootOutput = (output: unknown): void => {
    if (flushed || output === undefined) return;
    const serializedOutput = stringifyValue(output);
    rootSpan.setAttribute(
      LangfuseOtelSpanAttributes.TRACE_OUTPUT,
      serializedOutput,
    );
    rootSpan.setAttribute(
      LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
      serializedOutput,
    );
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
    setRootOutput,
    flush,
  };
}

/**
 * Maps the internal experiment context to the `langfuse.experiment.*` span
 * attributes that `OtelIngestionProcessor.extractExperimentFields` reads,
 * producing the same event-record fields as the LangChain path's
 * `buildInternalTraceEventInputs`.
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
