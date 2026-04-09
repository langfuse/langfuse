import { asRecord } from "../../utils/objects";
import { stringifyValue } from "../../utils/stringChecks";
import {
  convertCallsToArrays,
  convertDefinitionsToMap,
  extractToolsFromObservation,
} from "../ingestion/extractToolsBackend";
import { flattenJsonToPathArrays } from "../otel/utils";
import type { ProcessedTraceEvent } from "./types";

export const INTERNAL_TRACE_EVENT_SOURCE = "ingestion-api-dual-write";
export const INTERNAL_TRACE_EXPERIMENT_EVENT_SOURCE =
  "ingestion-api-dual-write-experiments";

export type InternalTraceExperimentContext = {
  id: string;
  name: string;
  metadata?: Record<string, unknown>;
  description?: string | null;
  datasetId: string;
  itemId: string;
  itemVersion: string;
  itemExpectedOutput?: unknown;
  itemMetadata?: Record<string, unknown> | null;
};

/**
 * Flexible input type for writing events to the events table.
 * This is intentionally loose to allow for iteration as the events
 * table schema evolves. Only required fields are enforced.
 */
export type InternalTraceEventInput = {
  projectId: string;
  traceId: string;
  spanId: string;
  startTimeISO: string;
  orgId?: string;
  parentSpanId?: string;
  name?: string;
  type?: string;
  environment?: string;
  version?: string;
  release?: string;
  endTimeISO: string;
  completionStartTime?: string;
  traceName?: string;
  tags?: string[];
  bookmarked?: boolean;
  public?: boolean;
  userId?: string;
  sessionId?: string;
  level?: string;
  statusMessage?: string;
  promptId?: string;
  promptName?: string;
  promptVersion?: string;
  modelId?: string;
  modelName?: string;
  modelParameters?: string | Record<string, unknown>;
  providedUsageDetails?: Record<string, number>;
  usageDetails?: Record<string, number>;
  providedCostDetails?: Record<string, number>;
  costDetails?: Record<string, number>;
  toolDefinitions?: Record<string, string>;
  toolCalls?: string[];
  toolCallNames?: string[];
  input?: string;
  output?: string;
  metadata: Record<string, unknown>;
  source: string;
  serviceName?: string;
  serviceVersion?: string;
  scopeName?: string;
  scopeVersion?: string;
  telemetrySdkLanguage?: string;
  telemetrySdkName?: string;
  telemetrySdkVersion?: string;
  blobStorageFilePath?: string;
  eventRaw?: string;
  eventBytes?: number;
  experimentId?: string;
  experimentName?: string;
  experimentMetadataNames?: string[];
  experimentMetadataValues?: Array<string | null | undefined>;
  experimentDescription?: string;
  experimentDatasetId?: string;
  experimentItemId?: string;
  experimentItemVersion?: string;
  experimentItemRootSpanId?: string;
  experimentItemExpectedOutput?: string;
  experimentItemMetadataNames?: string[];
  experimentItemMetadataValues?: Array<string | null | undefined>;
  [key: string]: any;
};

type InternalTraceSnapshot = {
  spanId: string;
  traceId: string;
  parentSpanId?: string;
  name?: string;
  type: "SPAN" | "GENERATION";
  environment?: string;
  version?: string;
  release?: string;
  startTimeISO?: string;
  endTimeISO?: string;
  completionStartTime?: string;
  level?: string;
  statusMessage?: string;
  promptName?: string;
  promptVersion?: string;
  modelName?: string;
  modelParameters?: Record<string, unknown>;
  providedUsageDetails?: Record<string, number>;
  providedCostDetails?: Record<string, number>;
  input?: unknown;
  output?: unknown;
  metadata: Record<string, unknown>;
  tags?: string[];
  public?: boolean;
  bookmarked?: boolean;
  userId?: string;
  sessionId?: string;
};

export type MaterializedInternalTrace = {
  rootSpanId: string;
  snapshots: InternalTraceSnapshot[];
};

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function asBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  return Array.isArray(value) &&
    value.every((entry) => typeof entry === "string")
    ? value
    : undefined;
}

function asNumberRecord(value: unknown): Record<string, number> | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  const normalized = Object.fromEntries(
    Object.entries(record).filter(
      ([, entry]) => typeof entry === "number" && Number.isFinite(entry),
    ),
  ) as Record<string, number>;

  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function isCreateEvent(type: string): boolean {
  return type.endsWith("-create");
}

function getSnapshotType(eventType: string): "SPAN" | "GENERATION" {
  return eventType.startsWith("generation-") ? "GENERATION" : "SPAN";
}

function getEventTime(
  event: ProcessedTraceEvent,
  body: Record<string, unknown>,
): number {
  const candidates = [body.startTime, body.timestamp, event.timestamp];

  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const parsed = new Date(candidate).getTime();
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }

  return 0;
}

function getTimestampMs(timestamp?: string): number {
  if (!timestamp) {
    return 0;
  }

  const parsed = new Date(timestamp).getTime();
  return Number.isNaN(parsed) ? 0 : parsed;
}

function sortEvents(events: ProcessedTraceEvent[]): ProcessedTraceEvent[] {
  return [...events].sort((left, right) => {
    const timeDelta =
      getEventTime(left, left.body) - getEventTime(right, right.body);

    if (timeDelta !== 0) {
      return timeDelta;
    }

    if (isCreateEvent(left.type) === isCreateEvent(right.type)) {
      return 0;
    }

    return isCreateEvent(left.type) ? -1 : 1;
  });
}

function flattenMetadata(value: unknown): {
  names: string[];
  values: Array<string | null | undefined>;
} {
  const metadata = asRecord(value);
  return metadata
    ? flattenJsonToPathArrays(metadata)
    : { names: [], values: [] };
}

function mergeSnapshotEvent(
  snapshot: InternalTraceSnapshot,
  event: ProcessedTraceEvent,
): InternalTraceSnapshot {
  const { body } = event;
  const startTime = asString(body.startTime);
  const timestamp = asString(body.timestamp) ?? asString(event.timestamp);
  const metadata = asRecord(body.metadata);

  return {
    ...snapshot,
    traceId: asString(body.traceId) ?? snapshot.traceId,
    parentSpanId: asString(body.parentObservationId) ?? snapshot.parentSpanId,
    type:
      snapshot.type === "GENERATION"
        ? snapshot.type
        : getSnapshotType(event.type),
    name: asString(body.name) ?? snapshot.name,
    environment: asString(body.environment) ?? snapshot.environment,
    version: asString(body.version) ?? snapshot.version,
    release: asString(body.release) ?? snapshot.release,
    startTimeISO:
      startTime ?? snapshot.startTimeISO ?? timestamp ?? snapshot.startTimeISO,
    endTimeISO: asString(body.endTime) ?? snapshot.endTimeISO,
    completionStartTime:
      asString(body.completionStartTime) ?? snapshot.completionStartTime,
    level: asString(body.level) ?? snapshot.level,
    statusMessage: asString(body.statusMessage) ?? snapshot.statusMessage,
    promptName: asString(body.promptName) ?? snapshot.promptName,
    promptVersion:
      typeof body.promptVersion === "number"
        ? body.promptVersion.toString()
        : (asString(body.promptVersion) ?? snapshot.promptVersion),
    modelName: asString(body.model) ?? snapshot.modelName,
    modelParameters: asRecord(body.modelParameters) ?? snapshot.modelParameters,
    providedUsageDetails:
      asNumberRecord(body.usageDetails) ??
      asNumberRecord(body.usage) ??
      snapshot.providedUsageDetails,
    providedCostDetails:
      asNumberRecord(body.costDetails) ?? snapshot.providedCostDetails,
    input:
      body.input !== undefined && body.input !== null
        ? body.input
        : snapshot.input,
    output:
      body.output !== undefined && body.output !== null
        ? body.output
        : snapshot.output,
    metadata: metadata
      ? { ...snapshot.metadata, ...metadata }
      : snapshot.metadata,
    tags: asStringArray(body.tags) ?? snapshot.tags,
    public: asBoolean(body.public) ?? snapshot.public,
    bookmarked: asBoolean(body.bookmarked) ?? snapshot.bookmarked,
    userId: asString(body.userId) ?? snapshot.userId,
    sessionId: asString(body.sessionId) ?? snapshot.sessionId,
  };
}

export function materializeInternalTrace(params: {
  processedEvents: ProcessedTraceEvent[];
  traceId: string;
}): MaterializedInternalTrace {
  const { processedEvents, traceId } = params;
  const snapshots = new Map<string, InternalTraceSnapshot>();
  const rootSpanId =
    asString(
      processedEvents.find((event) => event.type === "trace-create")?.body.id,
    ) ?? traceId;

  for (const event of sortEvents(processedEvents)) {
    const spanId = asString(event.body.id);

    if (!spanId) {
      continue;
    }

    const existingSnapshot =
      snapshots.get(spanId) ??
      ({
        spanId,
        traceId: asString(event.body.traceId) ?? traceId,
        type: getSnapshotType(event.type),
        metadata: {},
      } satisfies InternalTraceSnapshot);

    snapshots.set(spanId, mergeSnapshotEvent(existingSnapshot, event));
  }

  const orderedSnapshots = [...snapshots.values()].sort((left, right) => {
    if (left.spanId === rootSpanId) {
      return -1;
    }

    if (right.spanId === rootSpanId) {
      return 1;
    }

    return (
      getTimestampMs(left.startTimeISO) - getTimestampMs(right.startTimeISO)
    );
  });

  return {
    rootSpanId,
    snapshots: orderedSnapshots,
  };
}

export function buildInternalTraceEventInputs(params: {
  processedEvents: ProcessedTraceEvent[];
  traceId: string;
  projectId: string;
  experiment?: InternalTraceExperimentContext;
}): {
  rootSpanId: string;
  eventInputs: InternalTraceEventInput[];
} {
  const { processedEvents, traceId, projectId, experiment } = params;
  const { rootSpanId, snapshots } = materializeInternalTrace({
    processedEvents,
    traceId,
  });
  const rootSnapshot = snapshots.find(
    (snapshot) => snapshot.spanId === rootSpanId,
  );

  if (!rootSnapshot) {
    return { rootSpanId, eventInputs: [] };
  }

  const experimentMetadata = flattenMetadata(experiment?.metadata);
  const experimentItemMetadata = flattenMetadata(experiment?.itemMetadata);
  const source = experiment
    ? INTERNAL_TRACE_EXPERIMENT_EVENT_SOURCE
    : INTERNAL_TRACE_EVENT_SOURCE;

  const eventInputs = snapshots.map((snapshot) => {
    const { toolDefinitions, toolArguments } = extractToolsFromObservation(
      snapshot.input,
      snapshot.output,
    );
    const toolCalls = convertCallsToArrays(toolArguments);

    return {
      projectId,
      traceId,
      spanId: snapshot.spanId,
      parentSpanId:
        snapshot.spanId === rootSpanId
          ? undefined
          : (snapshot.parentSpanId ?? rootSpanId),
      name:
        snapshot.name ??
        (snapshot.type === "GENERATION"
          ? "generation"
          : (rootSnapshot.name ?? "span")),
      type: snapshot.type,
      environment: snapshot.environment ?? rootSnapshot.environment,
      version: snapshot.version ?? rootSnapshot.version,
      release: rootSnapshot.release,
      startTimeISO:
        snapshot.startTimeISO ??
        rootSnapshot.startTimeISO ??
        new Date().toISOString(),
      endTimeISO:
        snapshot.endTimeISO ??
        snapshot.startTimeISO ??
        rootSnapshot.endTimeISO ??
        rootSnapshot.startTimeISO ??
        new Date().toISOString(),
      completionStartTime: snapshot.completionStartTime,
      traceName: rootSnapshot.name,
      tags: rootSnapshot.tags ?? [],
      bookmarked: rootSnapshot.bookmarked,
      public: rootSnapshot.public,
      userId: rootSnapshot.userId,
      sessionId: rootSnapshot.sessionId,
      level: snapshot.level ?? "DEFAULT",
      statusMessage: snapshot.statusMessage,
      promptName: snapshot.promptName,
      promptVersion: snapshot.promptVersion,
      modelName: snapshot.modelName,
      modelParameters: snapshot.modelParameters,
      providedUsageDetails: snapshot.providedUsageDetails,
      providedCostDetails: snapshot.providedCostDetails,
      toolDefinitions: convertDefinitionsToMap(toolDefinitions),
      toolCalls: toolCalls.tool_calls,
      toolCallNames: toolCalls.tool_call_names,
      input:
        snapshot.input !== undefined
          ? stringifyValue(snapshot.input)
          : undefined,
      output:
        snapshot.output !== undefined
          ? stringifyValue(snapshot.output)
          : undefined,
      metadata: snapshot.metadata,
      source,
      experimentId: experiment?.id,
      experimentName: experiment?.name,
      experimentMetadataNames: experimentMetadata.names,
      experimentMetadataValues: experimentMetadata.values,
      experimentDescription: experiment?.description ?? undefined,
      experimentDatasetId: experiment?.datasetId,
      experimentItemId: experiment?.itemId,
      experimentItemVersion: experiment?.itemVersion,
      experimentItemRootSpanId: experiment ? rootSpanId : undefined,
      experimentItemExpectedOutput:
        experiment?.itemExpectedOutput !== undefined &&
        experiment?.itemExpectedOutput !== null
          ? stringifyValue(experiment.itemExpectedOutput)
          : undefined,
      experimentItemMetadataNames: experimentItemMetadata.names,
      experimentItemMetadataValues: experimentItemMetadata.values,
    } satisfies InternalTraceEventInput;
  });

  return {
    rootSpanId,
    eventInputs,
  };
}
