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
import {
  OtelIngestionProcessor,
  type ResourceSpan,
} from "./OtelIngestionProcessor";

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

  await publishInternalOtelResourceSpans({
    resourceSpans,
    projectId: params.projectId,
    sdkName: params.sdkName,
  });
}

/**
 * Publishes already-shaped internal resource spans through the v4 OTel queue.
 * This intentionally bypasses OTLP serialization so internal producers can
 * preserve Langfuse observation IDs that are not W3C hexadecimal span IDs.
 */
export async function publishInternalOtelResourceSpans(params: {
  resourceSpans: ResourceSpan[];
  projectId: string;
  sdkName: string;
}): Promise<void> {
  if (params.resourceSpans.length === 0) return;

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

  await processor.publishToOtelIngestionQueue(params.resourceSpans);
}

type InternalOtelAttribute = {
  key: string;
  value: { stringValue: string };
};

function stringAttribute(
  key: string,
  value: string | undefined | null,
): InternalOtelAttribute | undefined {
  return value === undefined || value === null
    ? undefined
    : { key, value: { stringValue: value } };
}

function jsonAttribute(
  key: string,
  value: unknown,
): InternalOtelAttribute | undefined {
  if (value === undefined || value === null) return undefined;

  return stringAttribute(key, JSON.stringify(value));
}

function timestampToUnixNano(timestamp: string): string {
  const milliseconds = Date.parse(timestamp);
  if (Number.isNaN(milliseconds)) {
    throw new Error(`Invalid internal trace timestamp: ${timestamp}`);
  }

  return `${BigInt(milliseconds) * 1_000_000n}`;
}

function observationTypeToOtelType(type: string | undefined): string {
  switch (type?.toUpperCase()) {
    case "GENERATION":
      return "generation";
    case "EVENT":
      return "event";
    case "EMBEDDING":
      return "embedding";
    case "AGENT":
      return "agent";
    case "TOOL":
      return "tool";
    case "CHAIN":
      return "chain";
    case "RETRIEVER":
      return "retriever";
    case "GUARDRAIL":
      return "guardrail";
    case "EVALUATOR":
      return "evaluator";
    default:
      return "span";
  }
}

function internalTraceInputsToResourceSpans(
  eventInputs: InternalTraceEventInput[],
): ResourceSpan[] {
  const spans = eventInputs.map((eventInput) => {
    const isRoot = !eventInput.parentSpanId;
    const attributes = [
      stringAttribute(
        LangfuseOtelSpanAttributes.ENVIRONMENT,
        eventInput.environment,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_TYPE,
        observationTypeToOtelType(eventInput.type),
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_LEVEL,
        eventInput.level,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_STATUS_MESSAGE,
        eventInput.statusMessage,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_INPUT,
        eventInput.input,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_OUTPUT,
        eventInput.output,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_METADATA,
        eventInput.metadata,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL,
        eventInput.modelName,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_MODEL_PARAMETERS,
        eventInput.modelParameters,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_USAGE_DETAILS,
        eventInput.providedUsageDetails,
      ),
      jsonAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_COST_DETAILS,
        eventInput.providedCostDetails,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_NAME,
        eventInput.promptName,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_PROMPT_VERSION,
        eventInput.promptVersion,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.OBSERVATION_COMPLETION_START_TIME,
        eventInput.completionStartTime,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_USER_ID,
        eventInput.userId,
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_SESSION_ID,
        eventInput.sessionId,
      ),
      jsonAttribute(LangfuseOtelSpanAttributes.TRACE_TAGS, eventInput.tags),
      stringAttribute(
        LangfuseOtelSpanAttributes.TRACE_PUBLIC,
        eventInput.public === undefined ? undefined : String(eventInput.public),
      ),
      stringAttribute(
        LangfuseOtelSpanAttributes.IS_APP_ROOT,
        eventInput.isAppRoot === undefined || eventInput.isAppRoot === null
          ? undefined
          : String(eventInput.isAppRoot),
      ),
      stringAttribute(LangfuseOtelSpanAttributes.RELEASE, eventInput.release),
      ...(isRoot
        ? [
            stringAttribute(
              LangfuseOtelSpanAttributes.TRACE_NAME,
              eventInput.traceName,
            ),
            jsonAttribute(
              LangfuseOtelSpanAttributes.TRACE_METADATA,
              eventInput.metadata,
            ),
          ]
        : []),
    ].filter((attribute): attribute is InternalOtelAttribute =>
      Boolean(attribute),
    );

    return {
      traceId: eventInput.traceId,
      spanId: eventInput.spanId,
      ...(eventInput.parentSpanId
        ? { parentSpanId: eventInput.parentSpanId }
        : {}),
      name: eventInput.name ?? "span",
      kind: 1,
      startTimeUnixNano: timestampToUnixNano(eventInput.startTimeISO),
      endTimeUnixNano: timestampToUnixNano(eventInput.endTimeISO),
      attributes,
      status: {
        ...(eventInput.level === "ERROR" ? { code: 2 } : {}),
        ...(eventInput.statusMessage
          ? { message: eventInput.statusMessage }
          : {}),
      },
    };
  });

  return [
    {
      resource: {
        attributes: [
          {
            key: "service.name",
            value: { stringValue: "langfuse-in-app-agent" },
          },
        ],
      },
      scopeSpans: [
        {
          scope: {
            name: INTERNAL_TRACE_WRITER_SCOPE,
            version: "unknown",
          },
          spans,
        },
      ],
    },
  ];
}

/**
 * Publishes normalized internal trace inputs through the v4 OTel ingestion
 * queue while preserving Langfuse's existing trace and observation IDs.
 */
export async function publishInternalTraceInputsViaOtelIngestion(params: {
  eventInputs: InternalTraceEventInput[];
  projectId: string;
}): Promise<void> {
  if (params.eventInputs.length === 0) return;

  await publishInternalOtelResourceSpans({
    resourceSpans: internalTraceInputsToResourceSpans(params.eventInputs),
    projectId: params.projectId,
    sdkName: INTERNAL_TRACE_WRITER_SDK_NAME,
  });
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
