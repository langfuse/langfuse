import { randomBytes } from "node:crypto";

import {
  ROOT_CONTEXT,
  TraceFlags,
  trace as otelTraceApi,
  type Attributes,
} from "@opentelemetry/api";
import { JsonTraceSerializer } from "@opentelemetry/otlp-transformer";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BasicTracerProvider,
  InMemorySpanExporter,
  SimpleSpanProcessor,
  type ReadableSpan,
} from "@opentelemetry/sdk-trace-base";

import type { InternalTraceEventInput } from "../llm/internalTraceEvents";
import { logger } from "../logger";
import { LangfuseOtelSpanAttributes } from "./attributes";
import { OtelIngestionProcessor } from "./OtelIngestionProcessor";

const INTERNAL_TRACE_WRITER_SDK_NAME = "langfuse-internal-otel-writer";
const INTERNAL_TRACE_WRITER_SCOPE = "langfuse-internal-trace-writer";
const W3C_TRACE_ID_PATTERN = /^[0-9a-f]{32}$/;

/**
 * Publishes internally captured OTel spans through the regular OTel ingestion
 * pipeline (same S3 + queue path as the public /api/public/otel/v1/traces
 * endpoint), so internal traces get exactly the same write treatment as user
 * traces: legacy traces/observations tables and events tables per the V4
 * migration flags. Shared by the AI-SDK judge capture (`createAiSdkTelemetryCapture`)
 * and `writeInternalTraceViaOtelIngestion`.
 */
export async function publishInternalOtelSpans(params: {
  spans: ReadableSpan[];
  projectId: string;
  sdkName: string;
}): Promise<void> {
  const serialized = JsonTraceSerializer.serializeRequest(params.spans);
  if (!serialized) return;

  const { resourceSpans } = JSON.parse(new TextDecoder().decode(serialized));

  if (!resourceSpans || resourceSpans.length === 0) return;

  const processor = new OtelIngestionProcessor({
    projectId: params.projectId,
    publicKey: "", // internal ingestion has no API key; mirrors internal event writes
    sdkName: params.sdkName,
    sdkVersion: "unknown",
    // Opt into the v4-native direct events write like a modern SDK batch:
    // only that path runs processToEvent -> createEventRecord, which is
    // the sole extractor of langfuse.experiment.* into experiment_*
    // columns. Without it, dual-write mode routes internal batches
    // (unknown SDK, no scope version) through legacy forwarding and
    // experiment run items lose their linkage in events_full/v4 views.
    // Legacy tables are still dual-written per v4WritesToLegacyTables.
    ingestionVersion: "4",
    // The consumer must parse these events with the internal ingestion
    // schema; the public schema strips the "langfuse-" environment prefix,
    // exposing internal traces as user environments and bypassing the
    // trace-upsert eval-loop guard.
    isLangfuseInternal: true,
  });

  await processor.publishToOtelIngestionQueue(resourceSpans);
}

/**
 * Exactly the `InternalTraceEventInput` fields this writer maps onto OTel
 * spans. Narrowed so a caller with richer inputs (usage, prompt, experiment
 * linkage, ...) gets a compile-time surface mismatch instead of silent drops.
 */
export type InternalOtelSpanInput = Pick<
  InternalTraceEventInput,
  | "projectId"
  | "traceId"
  | "spanId"
  | "parentSpanId"
  | "startTimeISO"
  | "endTimeISO"
  | "name"
  | "traceName"
  | "environment"
  | "level"
  | "statusMessage"
  | "input"
  | "output"
  | "metadata"
>;

/**
 * Writes an already-finished internal trace (e.g. a code-eval execution trace)
 * through the OTel ingestion pipeline via `publishInternalOtelSpans`. Unlike
 * `createInternalEventsWriter` in the worker, which only writes the v4 events
 * tables, this reaches every store the deployment's migration flags write to —
 * without it, trace-level auth (which reads the legacy traces table in dual
 * mode) 404s on these traces.
 *
 * Span IDs are newly generated (the code-eval producer sets `spanId` to the
 * 32-hex trace ID, which is not a valid OTel span ID), so inputs must be
 * ordered parents-first: a `parentSpanId` must reference a preceding input's
 * `spanId` to be remapped onto the generated ID.
 */
export async function writeInternalTraceViaOtelIngestion(trace: {
  rootSpanId: string;
  eventInputs: InternalOtelSpanInput[];
}): Promise<void> {
  const { eventInputs } = trace;
  if (eventInputs.length === 0) return;

  // Mirrors the createAiSdkTelemetryCapture guards: non-langfuse environments
  // would bypass the eval-loop safeguard, and a non-W3C trace ID would emit
  // silently malformed OTLP IDs.
  const invalidInput = eventInputs.find(
    (eventInput) =>
      !eventInput.environment?.startsWith("langfuse") ||
      !W3C_TRACE_ID_PATTERN.test(eventInput.traceId.toLowerCase()) ||
      eventInput.traceId.toLowerCase() === "0".repeat(32),
  );
  if (invalidInput) {
    logger.warn(
      "Skipping internal trace write: environment must be langfuse-prefixed and trace id a valid W3C trace id",
      {
        traceId: invalidInput.traceId,
        environment: invalidInput.environment,
      },
    );
    return;
  }

  const exporter = new InMemorySpanExporter();
  let currentTraceId = eventInputs[0].traceId.toLowerCase();
  const tracerProvider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [LangfuseOtelSpanAttributes.ENVIRONMENT]: eventInputs[0].environment,
    }),
    spanProcessors: [new SimpleSpanProcessor(exporter)],
    // Root spans (no parent) receive the input's Langfuse trace ID via
    // `currentTraceId`; span creation below is synchronous, so the closure is
    // safe.
    idGenerator: {
      generateTraceId: () => currentTraceId,
      generateSpanId: () => randomBytes(8).toString("hex"),
    },
  });

  try {
    const tracer = tracerProvider.getTracer(INTERNAL_TRACE_WRITER_SCOPE);
    const generatedSpanIds = new Map<string, string>();

    for (const eventInput of eventInputs) {
      currentTraceId = eventInput.traceId.toLowerCase();
      const isRoot = !eventInput.parentSpanId;
      const metadataJson = JSON.stringify(eventInput.metadata);

      const attributes: Attributes = {
        ...(eventInput.environment !== undefined
          ? { [LangfuseOtelSpanAttributes.ENVIRONMENT]: eventInput.environment }
          : {}),
        ...(eventInput.level !== undefined
          ? { [LangfuseOtelSpanAttributes.OBSERVATION_LEVEL]: eventInput.level }
          : {}),
        ...(eventInput.statusMessage !== undefined
          ? {
              [LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE]:
                eventInput.statusMessage,
            }
          : {}),
        ...(eventInput.input !== undefined
          ? { [LangfuseOtelSpanAttributes.OBSERVATION_INPUT]: eventInput.input }
          : {}),
        ...(eventInput.output !== undefined
          ? {
              [LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT]:
                eventInput.output,
            }
          : {}),
        [LangfuseOtelSpanAttributes.OBSERVATION_METADATA]: metadataJson,
        ...(isRoot && eventInput.traceName !== undefined
          ? { [LangfuseOtelSpanAttributes.TRACE_NAME]: eventInput.traceName }
          : {}),
        ...(isRoot
          ? { [LangfuseOtelSpanAttributes.TRACE_METADATA]: metadataJson }
          : {}),
      };

      let context = ROOT_CONTEXT;
      if (eventInput.parentSpanId) {
        const generatedParentSpanId = generatedSpanIds.get(
          eventInput.parentSpanId,
        );
        if (!generatedParentSpanId) {
          throw new Error(
            "Internal trace input's parentSpanId must reference a preceding input's spanId",
          );
        }
        context = otelTraceApi.setSpanContext(ROOT_CONTEXT, {
          traceId: currentTraceId,
          spanId: generatedParentSpanId,
          traceFlags: TraceFlags.SAMPLED,
        });
      }

      const span = tracer.startSpan(
        eventInput.name ?? "",
        { startTime: new Date(eventInput.startTimeISO), attributes },
        context,
      );
      generatedSpanIds.set(eventInput.spanId, span.spanContext().spanId);
      span.end(new Date(eventInput.endTimeISO));
    }

    await tracerProvider.forceFlush();

    await publishInternalOtelSpans({
      spans: exporter.getFinishedSpans(),
      projectId: eventInputs[0].projectId,
      sdkName: INTERNAL_TRACE_WRITER_SDK_NAME,
    });
  } finally {
    await tracerProvider.shutdown().catch(() => undefined);
  }
}
