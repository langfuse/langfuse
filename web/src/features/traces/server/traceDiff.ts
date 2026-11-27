import { createHash } from "node:crypto";
import { parseJsonPrioritised, type Observation } from "@langfuse/shared";

const DEFAULT_MAX_PREVIEW_CODE_POINTS = 2000;
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
  "recognized tool message/tool_use identity references",
  "metadata identity/timestamp fields",
] as const;

type ObservationNode = {
  observation: Observation;
  payload: ReturnType<typeof observationPayload>;
  ownCanonical: string;
  branchCanonical?: string;
  children: ObservationNode[];
};

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

function isVolatileToolIdentity(
  key: string,
  parentKey: string | undefined,
  record: Record<string, unknown>,
): boolean {
  const compactKey = key.replace(/[_-]/g, "").toLowerCase();
  const compactParentKey = parentKey?.replace(/[_-]/g, "").toLowerCase();
  if (
    (compactParentKey === "toolcalls" ||
      compactParentKey === "toolcallchunks") &&
    compactKey === "id"
  ) {
    return true;
  }

  const type = typeof record.type === "string" ? record.type : undefined;
  const role = typeof record.role === "string" ? record.role : undefined;
  if (
    (type === "tool_use" ||
      type === "function_call" ||
      type === "function_call_output") &&
    compactKey === "id"
  ) {
    return true;
  }

  return (
    (role === "tool" ||
      type === "tool_use" ||
      type === "tool_result" ||
      type === "function_call" ||
      type === "function_call_output") &&
    (compactKey === "toolcallid" ||
      compactKey === "tooluseid" ||
      compactKey === "callid")
  );
}

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
        if (
          isVolatileToolIdentity(
            key,
            parentKey,
            value as Record<string, unknown>,
          )
        ) {
          return false;
        }
        return !(
          stripVolatileMetadata && VOLATILE_METADATA_KEYS.has(key.toLowerCase())
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
  const parsed = parseJsonPrioritised(trimmed);
  if (parsed === trimmed) return value;
  return normalize(parsed, parentKey, stripVolatileMetadata);
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
    const output = parseJsonStrings(observation.output) as
      | { tool_calls?: readonly unknown[] }
      | null
      | undefined;
    toolCallCount +=
      output?.tool_calls?.length ||
      observation.toolCalls?.length ||
      observation.toolCallNames?.length ||
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
  // Mirror orderObservations' earliest-row dedupe and orphan handling, but use
  // subtree digests to break same-time sibling ties independently of row order.
  const byId = new Map<string, ObservationNode>();
  for (const observation of observations) {
    const payload = observationPayload(observation);
    const node: ObservationNode = {
      observation,
      payload,
      ownCanonical: canonicalize(payload),
      children: [],
    };
    const existing = byId.get(observation.id);
    if (
      !existing ||
      observation.startTime < existing.observation.startTime ||
      (observation.startTime.getTime() ===
        existing.observation.startTime.getTime() &&
        node.ownCanonical < existing.ownCanonical)
    ) {
      byId.set(observation.id, node);
    }
  }

  const roots: ObservationNode[] = [];
  for (const node of byId.values()) {
    const parentId = node.observation.parentObservationId;
    const parent = parentId ? byId.get(parentId) : undefined;
    if (parent) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const branchKey = (node: ObservationNode): string => {
    if (node.branchCanonical !== undefined) return node.branchCanonical;
    const children = node.children.map((child) => ({
      startTime: child.observation.startTime.getTime(),
      key: branchKey(child),
    }));
    children.sort(
      (left, right) =>
        left.startTime - right.startTime || left.key.localeCompare(right.key),
    );
    const hash = createHash("sha256").update(node.ownCanonical);
    for (const child of children) hash.update(child.key);
    node.branchCanonical = hash.digest("hex");
    return node.branchCanonical;
  };
  const compareSiblings = (left: ObservationNode, right: ObservationNode) =>
    left.observation.startTime.getTime() -
      right.observation.startTime.getTime() ||
    branchKey(left).localeCompare(branchKey(right));
  const toEvent = (node: ObservationNode, nestingLevel: number) => ({
    observationType: node.observation.type,
    observationName: node.observation.name,
    nestingLevel,
    canonical: canonicalize({ ...node.payload, nestingLevel }),
  });

  const events: TraceDiffEvent[] = [];
  const visited = new Set<string>();
  const walk = (nodes: ObservationNode[], nestingLevel: number) => {
    for (const node of [...nodes].sort(compareSiblings)) {
      if (visited.has(node.observation.id)) continue;
      visited.add(node.observation.id);
      events.push(toEvent(node, nestingLevel));
      walk(node.children, nestingLevel + 1);
    }
  };
  walk(roots, 0);

  // Rows in a parent cycle have no root. Keep them without recursing forever.
  const remaining = [...byId.values()]
    .filter((node) => !visited.has(node.observation.id))
    .sort(
      (left, right) =>
        left.observation.startTime.getTime() -
          right.observation.startTime.getTime() ||
        left.ownCanonical.localeCompare(right.ownCanonical),
    );
  for (const node of remaining) {
    if (visited.has(node.observation.id)) continue;
    visited.add(node.observation.id);
    events.push(toEvent(node, 0));
  }
  return events;
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
