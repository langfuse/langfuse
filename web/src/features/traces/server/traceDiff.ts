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
  structureCanonical?: string;
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

type ObservationForest = {
  roots: ObservationNode[];
  nodes: ObservationNode[];
};

type NodePair = {
  left?: ObservationNode;
  right?: ObservationNode;
};

type ObservationPair = NodePair & { nestingLevel: number };

function buildObservationForest(
  observations: readonly Observation[],
): ObservationForest {
  // Mirror orderObservations' earliest-row dedupe and orphan handling.
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
  return { roots, nodes: [...byId.values()] };
}

/** Exact subtree identity, independent of same-time database row order. */
function branchKey(
  node: ObservationNode,
  visiting = new Set<ObservationNode>(),
): string {
  if (node.branchCanonical !== undefined) return node.branchCanonical;
  if (visiting.has(node)) {
    return createHash("sha256")
      .update(`cycle:${node.ownCanonical}`)
      .digest("hex");
  }
  visiting.add(node);
  const children = node.children.map((child) => ({
    startTime: child.observation.startTime.getTime(),
    key: branchKey(child, visiting),
  }));
  visiting.delete(node);
  children.sort(
    (left, right) =>
      left.startTime - right.startTime || left.key.localeCompare(right.key),
  );
  const hash = createHash("sha256").update(node.ownCanonical);
  for (const child of children) hash.update(child.key);
  node.branchCanonical = hash.digest("hex");
  return node.branchCanonical;
}

/** Type/name structure stays stable when a nested tool payload changes. */
function structureKey(
  node: ObservationNode,
  visiting = new Set<ObservationNode>(),
): string {
  if (node.structureCanonical !== undefined) return node.structureCanonical;
  const own = JSON.stringify([node.observation.type, node.observation.name]);
  if (visiting.has(node)) {
    return createHash("sha256").update(`cycle:${own}`).digest("hex");
  }
  visiting.add(node);
  const children = node.children.map((child) => ({
    startTime: child.observation.startTime.getTime(),
    key: structureKey(child, visiting),
  }));
  visiting.delete(node);
  children.sort(
    (left, right) =>
      left.startTime - right.startTime || left.key.localeCompare(right.key),
  );
  const hash = createHash("sha256").update(own);
  for (const child of children) hash.update(child.key);
  node.structureCanonical = hash.digest("hex");
  return node.structureCanonical;
}

function similarityScore(
  left: ObservationNode,
  right: ObservationNode,
): number {
  let score = 0;
  if (left.ownCanonical === right.ownCanonical) score += 8;
  if (structureKey(left) === structureKey(right)) score += 4;
  const rightChildren = new Set(
    right.children.map((child) => branchKey(child)),
  );
  for (const child of left.children) {
    if (rightChildren.has(branchKey(child))) score += 1;
  }
  return score;
}

function takeMatches(
  left: ObservationNode[],
  right: ObservationNode[],
  keyOf: (node: ObservationNode) => string,
): { pairs: NodePair[]; left: ObservationNode[]; right: ObservationNode[] } {
  const buckets = new Map<string, ObservationNode[]>();
  for (const node of right) {
    const key = keyOf(node);
    buckets.set(key, [...(buckets.get(key) ?? []), node]);
  }
  const usedRight = new Set<ObservationNode>();
  const pairs: NodePair[] = [];
  const unmatchedLeft: ObservationNode[] = [];
  for (const node of left) {
    const candidates = (buckets.get(keyOf(node)) ?? []).filter(
      (candidate) => !usedRight.has(candidate),
    );
    if (candidates.length === 0) {
      unmatchedLeft.push(node);
      continue;
    }
    let match = candidates[0]!;
    if (candidates.length > 1) {
      let bestScore = -1;
      for (const candidate of candidates) {
        const score = similarityScore(node, candidate);
        if (score > bestScore) {
          bestScore = score;
          match = candidate;
        }
      }
    }
    usedRight.add(match);
    pairs.push({ left: node, right: match });
  }
  return {
    pairs,
    left: unmatchedLeft,
    right: right.filter((node) => !usedRight.has(node)),
  };
}

function pairSortKeys(pair: NodePair): [string, string] {
  const keys = [pair.left, pair.right]
    .filter((node): node is ObservationNode => node !== undefined)
    .map((node) => structureKey(node))
    .sort();
  return [keys[0] ?? "", keys[1] ?? keys[0] ?? ""];
}

function alignSameTimeSiblings(
  left: ObservationNode[],
  right: ObservationNode[],
): NodePair[] {
  let remainingLeft = left;
  let remainingRight = right;
  const pairs: NodePair[] = [];
  const matchers: Array<(node: ObservationNode) => string> = [
    branchKey,
    structureKey,
    (node) => node.ownCanonical,
  ];
  for (const keyOf of matchers) {
    const matched = takeMatches(remainingLeft, remainingRight, keyOf);
    pairs.push(...matched.pairs);
    remainingLeft = matched.left;
    remainingRight = matched.right;
  }

  const remainingCount = Math.max(remainingLeft.length, remainingRight.length);
  for (let index = 0; index < remainingCount; index += 1) {
    const leftNode = remainingLeft[index];
    const rightNode = remainingRight[index];
    pairs.push({
      ...(leftNode ? { left: leftNode } : {}),
      ...(rightNode ? { right: rightNode } : {}),
    });
  }

  // Structure, unlike a full subtree hash, does not change when only a nested
  // tool argument changes. Exact matches are stable ties and contain no diff.
  return pairs.sort((leftPair, rightPair) => {
    const leftKeys = pairSortKeys(leftPair);
    const rightKeys = pairSortKeys(rightPair);
    return (
      leftKeys[0].localeCompare(rightKeys[0]) ||
      leftKeys[1].localeCompare(rightKeys[1])
    );
  });
}

function alignObservationTrees(
  leftObservations: readonly Observation[],
  rightObservations: readonly Observation[],
): ObservationPair[] {
  const leftForest = buildObservationForest(leftObservations);
  const rightForest = buildObservationForest(rightObservations);
  const aligned: ObservationPair[] = [];
  const visitedLeft = new Set<ObservationNode>();
  const visitedRight = new Set<ObservationNode>();

  const walk = (
    leftNodes: ObservationNode[],
    rightNodes: ObservationNode[],
    nestingLevel: number,
  ) => {
    const times = [
      ...new Set(
        [...leftNodes, ...rightNodes].map((node) =>
          node.observation.startTime.getTime(),
        ),
      ),
    ].sort((left, right) => left - right);
    for (const time of times) {
      const pairs = alignSameTimeSiblings(
        leftNodes.filter(
          (node) => node.observation.startTime.getTime() === time,
        ),
        rightNodes.filter(
          (node) => node.observation.startTime.getTime() === time,
        ),
      );
      for (const pair of pairs) {
        if (
          (pair.left && visitedLeft.has(pair.left)) ||
          (pair.right && visitedRight.has(pair.right))
        ) {
          continue;
        }
        if (pair.left) visitedLeft.add(pair.left);
        if (pair.right) visitedRight.add(pair.right);
        aligned.push({ ...pair, nestingLevel });
        if (pair.left && pair.right) {
          walk(pair.left.children, pair.right.children, nestingLevel + 1);
        }
      }
    }
  };

  walk(leftForest.roots, rightForest.roots, 0);
  const remainingLeft = leftForest.nodes.filter(
    (node) => !visitedLeft.has(node),
  );
  const remainingRight = rightForest.nodes.filter(
    (node) => !visitedRight.has(node),
  );
  if (remainingLeft.length > 0 || remainingRight.length > 0) {
    walk(remainingLeft, remainingRight, 0);
  }
  return aligned;
}

function observationEvent(
  node: ObservationNode,
  nestingLevel: number,
): TraceDiffEvent {
  return {
    observationType: node.observation.type,
    observationName: node.observation.name,
    nestingLevel,
    canonical: canonicalize({ ...node.payload, nestingLevel }),
  };
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

  const pairs = alignObservationTrees(left.observations, right.observations);
  let firstDivergence: TraceDivergence | undefined;
  let comparedObservations = pairs.filter(
    (pair) => pair.left && pair.right,
  ).length;

  for (let index = 0; index < pairs.length; index += 1) {
    const pair = pairs[index]!;
    const leftEvent = pair.left
      ? observationEvent(pair.left, pair.nestingLevel)
      : undefined;
    const rightEvent = pair.right
      ? observationEvent(pair.right, pair.nestingLevel)
      : undefined;
    if (!leftEvent || !rightEvent) {
      firstDivergence = {
        index,
        reason: "length",
        location: locationOf(leftEvent ?? rightEvent, index),
        leftPreview: preview(leftEvent, maxPreviewCodePoints),
        rightPreview: preview(rightEvent, maxPreviewCodePoints),
      };
      comparedObservations = index;
      break;
    }
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
