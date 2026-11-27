import type { Observation } from "@langfuse/shared";
import { orderObservations } from "@langfuse/shared/src/server";

const DEFAULT_MAX_PREVIEW_CODE_POINTS = 2000;
const TRACE_DIFF_INDEX = Symbol("traceDiffIndex");
const VOLATILE_METADATA_KEYS = new Set([
  "id",
  "traceid",
  "spanid",
  "parentobservationid",
  "starttime",
  "endtime",
  "createdat",
  "updatedat",
  "eventts",
  "timestamp",
  "requestid",
  "sessionid",
  "messageid",
  "eventid",
]);

const TRACE_DIFF_IGNORED_FIELDS = [
  "observation.id",
  "observation.parentObservationId",
  "observation.startTime",
  "observation.endTime",
  "observation.createdAt",
  "observation.updatedAt",
  "observation.eventTs",
  "tool_calls[].id",
  "toolCalls[].id",
  "metadata identity/timestamp fields",
] as const;

type IndexedObservation = Observation & { [TRACE_DIFF_INDEX]: number };

type TraceDiffEvent = {
  observationType: Observation["type"];
  observationName: Observation["name"];
  nestingLevel: number;
  canonical: string;
};

type TraceDiffSummary = {
  observationCount: number;
  toolCallCount: number;
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
};

type TraceDivergence = {
  index: number;
  reason: "observation-type" | "payload" | "length";
  location: string;
  leftPreview: string | null;
  rightPreview: string | null;
};

export type TraceDiffReport = {
  status: "identical" | "different";
  left: TraceDiffSummary & { traceId: string };
  right: TraceDiffSummary & { traceId: string };
  comparedObservations: number;
  costDelta: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
  ignoredFields: readonly string[];
  firstDivergence?: TraceDivergence;
};

export type TraceDiffInput = {
  traceId: string;
  observations: readonly Observation[];
};

function normalize(
  value: unknown,
  parentKey?: string,
  stripVolatileMetadata = false,
): unknown {
  if (typeof value === "string") {
    return parseJsonStrings(value, stripVolatileMetadata, parentKey);
  }

  if (Array.isArray(value)) {
    return value.map((item) =>
      normalize(item, parentKey, stripVolatileMetadata),
    );
  }

  if (value !== null && typeof value === "object") {
    const normalizedEntries = Object.entries(value)
      .filter(([key]) => {
        const normalizedKey = key.toLowerCase();
        const normalizedParentKey = parentKey?.toLowerCase();
        if (
          (normalizedParentKey === "tool_calls" ||
            normalizedParentKey === "toolcalls") &&
          normalizedKey === "id"
        ) {
          return false;
        }
        return !(
          stripVolatileMetadata && VOLATILE_METADATA_KEYS.has(normalizedKey)
        );
      })
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, member]) => [
        key,
        normalize(member, key, stripVolatileMetadata),
      ]);
    return Object.fromEntries(normalizedEntries);
  }

  return value;
}

function parseJsonStrings(
  value: unknown,
  stripVolatileMetadata = false,
  parentKey?: string,
): unknown {
  if (typeof value !== "string") {
    return normalize(value, parentKey, stripVolatileMetadata);
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return value;
  }
  try {
    return normalize(JSON.parse(trimmed), parentKey, stripVolatileMetadata);
  } catch {
    return value;
  }
}

function canonicalize(value: unknown): string {
  return JSON.stringify(parseJsonStrings(value)) ?? "null";
}

function roundCost(value: number): number {
  return Number(value.toFixed(12));
}

function summarize(
  traceId: string,
  observations: readonly Observation[],
): TraceDiffSummary & { traceId: string } {
  let toolCallCount = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let totalCost = 0;

  for (const observation of observations) {
    const output = observation.output as
      | { tool_calls?: readonly unknown[] }
      | null
      | undefined;
    toolCallCount +=
      output?.tool_calls?.length ??
      observation.toolCalls?.length ??
      observation.toolCallNames?.length ??
      0;
    inputTokens += observation.inputUsage;
    outputTokens += observation.outputUsage;
    totalCost += observation.totalCost ?? 0;
  }

  return {
    traceId,
    observationCount: observations.length,
    toolCallCount,
    inputTokens,
    outputTokens,
    totalCost: roundCost(totalCost),
  };
}

function observationPayload(observation: Observation) {
  return {
    type: observation.type,
    name: observation.name,
    level: observation.level,
    statusMessage: observation.statusMessage,
    model: observation.model,
    modelParameters: observation.modelParameters,
    input: parseJsonStrings(observation.input),
    output: parseJsonStrings(observation.output),
    metadata: normalize(observation.metadata, undefined, true),
    usageDetails: observation.usageDetails,
    costDetails: observation.costDetails,
    totalCost: observation.totalCost,
    version: observation.version,
    environment: observation.environment,
    toolDefinitions: observation.toolDefinitions,
    toolCalls: parseJsonStrings(observation.toolCalls),
    toolCallNames: observation.toolCallNames,
  };
}

function projectObservations(
  observations: readonly Observation[],
): TraceDiffEvent[] {
  // Canonical payloads provide a deterministic tie-breaker for siblings with
  // identical start times. Precompute them instead of parsing in the comparator.
  const prepared = observations.map((observation, index) => {
    const payload = observationPayload(observation);
    const indexed: IndexedObservation = {
      ...observation,
      [TRACE_DIFF_INDEX]: index,
    };
    return { observation: indexed, payload, sortKey: canonicalize(payload) };
  });
  const payloads = prepared.map((item) => item.payload);
  prepared.sort((left, right) => left.sortKey.localeCompare(right.sortKey));

  return orderObservations(prepared.map((item) => item.observation)).map(
    (observation) => {
      const payload = payloads[observation[TRACE_DIFF_INDEX]]!;
      return {
        observationType: observation.type,
        observationName: observation.name,
        nestingLevel: observation.nestingLevel,
        canonical: canonicalize({
          ...payload,
          nestingLevel: observation.nestingLevel,
        }),
      };
    },
  );
}

function preview(
  event: TraceDiffEvent | undefined,
  maxCodePoints: number,
): string | null {
  if (!event) return null;
  const text = `${event.observationType} ${event.canonical}`;
  const codePoints = Array.from(text);
  return codePoints.length <= maxCodePoints
    ? text
    : `${codePoints.slice(0, maxCodePoints).join("")}…`;
}

function locationOf(event: TraceDiffEvent | undefined, index: number): string {
  if (!event) return `observation ${index + 1} (end of one trace)`;
  const name = event.observationName ?? "unnamed";
  return `observation ${index + 1} / ${event.observationType} ${name} / nesting ${event.nestingLevel}`;
}

/** Compare two traces without invoking model or tool work. */
export function buildTraceDiff(
  left: TraceDiffInput,
  right: TraceDiffInput,
  maxPreviewCodePoints = DEFAULT_MAX_PREVIEW_CODE_POINTS,
): TraceDiffReport {
  if (!Number.isSafeInteger(maxPreviewCodePoints) || maxPreviewCodePoints < 1) {
    throw new Error("maxPreviewCodePoints must be a positive safe integer");
  }

  const leftEvents = projectObservations(left.observations);
  const rightEvents = projectObservations(right.observations);
  const commonLength = Math.min(leftEvents.length, rightEvents.length);
  let firstDivergence: TraceDivergence | undefined;
  let comparedObservations = commonLength;

  for (let index = 0; index < commonLength; index += 1) {
    const leftEvent = leftEvents[index]!;
    const rightEvent = rightEvents[index]!;
    if (leftEvent.observationType !== rightEvent.observationType) {
      firstDivergence = {
        index,
        reason: "observation-type",
        location: locationOf(leftEvent, index),
        leftPreview: preview(leftEvent, maxPreviewCodePoints),
        rightPreview: preview(rightEvent, maxPreviewCodePoints),
      };
      comparedObservations = index;
      break;
    }
    if (leftEvent.canonical !== rightEvent.canonical) {
      firstDivergence = {
        index,
        reason: "payload",
        location: locationOf(leftEvent, index),
        leftPreview: preview(leftEvent, maxPreviewCodePoints),
        rightPreview: preview(rightEvent, maxPreviewCodePoints),
      };
      comparedObservations = index;
      break;
    }
  }

  if (!firstDivergence && leftEvents.length !== rightEvents.length) {
    const leftEvent = leftEvents[commonLength];
    const rightEvent = rightEvents[commonLength];
    firstDivergence = {
      index: commonLength,
      reason: "length",
      location: locationOf(leftEvent ?? rightEvent, commonLength),
      leftPreview: preview(leftEvent, maxPreviewCodePoints),
      rightPreview: preview(rightEvent, maxPreviewCodePoints),
    };
    comparedObservations = commonLength;
  }

  const leftSummary = summarize(left.traceId, left.observations);
  const rightSummary = summarize(right.traceId, right.observations);
  return {
    status: firstDivergence ? "different" : "identical",
    left: leftSummary,
    right: rightSummary,
    comparedObservations,
    costDelta: {
      inputTokens: rightSummary.inputTokens - leftSummary.inputTokens,
      outputTokens: rightSummary.outputTokens - leftSummary.outputTokens,
      totalCost: roundCost(rightSummary.totalCost - leftSummary.totalCost),
    },
    ignoredFields: TRACE_DIFF_IGNORED_FIELDS,
    ...(firstDivergence ? { firstDivergence } : {}),
  };
}
