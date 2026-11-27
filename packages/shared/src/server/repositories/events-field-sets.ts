import {
  OBSERVATION_FIELD_GROUPS_PUBLIC_API,
  type ObservationFieldGroupPublicApi,
} from "../../domain/observation-field-groups";
import type { EventsObservationPublic } from "../queries/createGenerationsQuery";

/**
 * Every events row field, in canonical SELECT order. Both the raw-SQL
 * `EventsQueryBuilder` and the query-AST selects order their columns by it.
 */
const EVENTS_FIELD_ORDER = [
  "count",
  "uniqueTraceCount",
  "id",
  "traceId",
  "projectId",
  "environment",
  "type",
  "parentObservationId",
  "isRootObservation",
  "isAppRoot",
  "name",
  "level",
  "statusMessage",
  "version",
  "bookmarked",
  "public",
  "userId",
  "sessionId",
  "traceName",
  "startTime",
  "endTime",
  "completionStartTime",
  "createdAt",
  "updatedAt",
  "eventTs",
  "providedModelName",
  "internalModelId",
  "modelParameters",
  "providedUsageDetails",
  "usageDetails",
  "providedCostDetails",
  "costDetails",
  "totalCost",
  "promptId",
  "promptName",
  "promptVersion",
  "skillsAvailable",
  "skillsResourceLoaded",
  "toolDefinitions",
  "toolCalls",
  "toolCallNames",
  "usagePricingTierId",
  "usagePricingTierName",
  "input",
  "output",
  "metadata",
  "tags",
  "release",
  "modelId",
  "experimentId",
  "experimentName",
  "experimentDescription",
  "experimentDatasetId",
  "experimentMetadata",
  "experimentItemId",
  "experimentItemRootSpanId",
  "experimentItemExpectedOutput",
  "experimentItemMetadata",
  "experimentItemVersion",
  "latency",
  "timeToFirstToken",
] as const;

export type EventsFieldKey = (typeof EVENTS_FIELD_ORDER)[number];

const EVENTS_FIELD_ORDER_INDEX = new Map<string, number>(
  EVENTS_FIELD_ORDER.map((key, index) => [key, index]),
);

/**
 * Predefined field sets for common query patterns
 * Maps set names to arrays of field keys from EVENTS_FIELD_ORDER
 */
export const FIELD_SETS = {
  // Aggregates
  count: ["count"],
  countWithUniqueTraces: ["count", "uniqueTraceCount"],

  // List query field sets (for getObservationsWithModelDataFromEventsTable)
  base: [
    "id",
    "type",
    "projectId",
    "name",
    "modelParameters",
    "startTime",
    "endTime",
    "traceId",
    "completionStartTime",
    "providedUsageDetails",
    "usageDetails",
    "providedCostDetails",
    "costDetails",
    "level",
    "environment",
    "bookmarked",
    "public",
    "statusMessage",
    "version",
    "parentObservationId",
    "isRootObservation",
    "createdAt",
    "updatedAt",
    "providedModelName",
    "totalCost",
    "usagePricingTierId",
    "usagePricingTierName",
    "promptId",
    "promptName",
    "promptVersion",
    "internalModelId",
    "userId",
    "sessionId",
    "traceName",
    "release",
    "tags",
    "toolDefinitions",
    "toolCalls",
    "toolCallNames",
  ],
  baseWithoutTools: [
    "id",
    "type",
    "projectId",
    "name",
    "modelParameters",
    "startTime",
    "endTime",
    "traceId",
    "completionStartTime",
    "providedUsageDetails",
    "usageDetails",
    "providedCostDetails",
    "costDetails",
    "level",
    "environment",
    "bookmarked",
    "public",
    "statusMessage",
    "version",
    "parentObservationId",
    "isRootObservation",
    "createdAt",
    "updatedAt",
    "providedModelName",
    "totalCost",
    "usagePricingTierId",
    "usagePricingTierName",
    "promptId",
    "promptName",
    "promptVersion",
    "internalModelId",
    "userId",
    "sessionId",
    "traceName",
    "release",
    "tags",
    // Keep lightweight tool names available even when heavy tool payloads are omitted.
    "toolCallNames",
  ],
  calculated: ["latency", "timeToFirstToken"],
  io: ["input", "output"],
  metadata: ["metadata"],
  tools: ["toolDefinitions", "toolCalls", "toolCallNames"],
  trace_context: ["tags", "release", "traceName"],
  model_export: ["providedModelName", "modelId", "modelParameters"],
  eventTs: ["eventTs"],
  publicApiExperimentItemCore: [
    "id",
    "projectId",
    "traceId",
    "startTime",
    "endTime",
    "level",
    "environment",
    "experimentId",
    "experimentName",
    "experimentItemId",
  ],
  publicApiExperimentItemDataset: [
    "experimentDatasetId",
    "experimentItemVersion",
  ],
  publicApiExperimentItemExpectedOutput: ["experimentItemExpectedOutput"],
  publicApiExperimentItemMetadataFields: ["experimentItemMetadata"],
  publicApiExperimentItemExperimentMetadata: [
    "experimentMetadata",
    "experimentDescription",
  ],
  // Public API v2 field sets (field groups for selective fetching)
  core: [
    "id",
    "traceId",
    "startTime",
    "endTime",
    "projectId",
    "parentObservationId",
    "type",
  ],
  basic: [
    "name",
    "level",
    "statusMessage",
    "version",
    "environment",
    "bookmarked",
    "public",
    "userId",
    "sessionId",
    "isRootObservation",
  ],
  time: ["completionStartTime", "createdAt", "updatedAt"],
  model: ["providedModelName", "internalModelId", "modelParameters"],
  usage: [
    "usageDetails",
    "costDetails",
    "totalCost",
    "usagePricingTierId",
    "usagePricingTierName",
  ],
  prompt: ["promptId", "promptName", "promptVersion"],
  metrics: ["latency", "timeToFirstToken"],

  // Batch export field set (all fields needed for CSV/JSON exports)
  export: [
    "id",
    "traceId",
    "projectId",
    "startTime",
    "endTime",
    "name",
    "type",
    "environment",
    "version",
    "userId",
    "sessionId",
    "level",
    "statusMessage",
    "promptName",
    "promptId",
    "promptVersion",
    "modelId",
    "providedModelName",
    "modelParameters",
    "usageDetails",
    "costDetails",
    "totalCost",
    "completionStartTime",
    "latency",
    "timeToFirstToken",
    "tags",
    "release",
    "traceName",
    "parentObservationId",
    "bookmarked",
    "public",
    "createdAt",
    "updatedAt",
    "toolDefinitions",
    "toolCalls",
    "toolCallNames",
    "usagePricingTierId",
    "usagePricingTierName",
  ],

  eval: [
    "id",
    "traceId",
    "projectId",
    "parentObservationId",
    "isAppRoot",
    "type",
    "name",
    "environment",
    "version",
    "level",
    "statusMessage",
    "traceName",
    "userId",
    "sessionId",
    "tags",
    "release",
    "providedModelName",
    "modelParameters",
    "promptId",
    "promptName",
    "promptVersion",
    "providedUsageDetails",
    "usageDetails",
    "providedCostDetails",
    "costDetails",
    "toolDefinitions",
    "toolCalls",
    "toolCallNames",
    "experimentId",
    "experimentName",
    "experimentItemRootSpanId",
    "experimentItemExpectedOutput",
    "experimentItemMetadata",
  ],

  // Experiment items field set
  experimentItems: [
    "id", // span_id (observation_id)
    "traceId",
    "input",
    "output",
    "startTime",
    "level",

    // Experiment metadata
    "experimentId",
    "experimentName",
    "experimentDatasetId",

    // Experiment item metadata
    "experimentItemId",
    "experimentItemRootSpanId",
    "experimentItemVersion",
    "experimentItemExpectedOutput",
    "experimentItemMetadata",

    // Event metadata
    "metadata",
  ],
} as const satisfies Record<string, readonly EventsFieldKey[]>;

export type FieldSetName = keyof typeof FIELD_SETS;

// Canonicalize by EVENTS_FIELD_ORDER so SELECT column order does
// not follow caller field-set order. Clustered ClickHouse reads align result
// blocks by position; incompatible Map types (cost_details vs metadata) 500
// when those columns swap places.
export function orderedFieldKeys<K extends string>(
  fieldKeys: readonly K[],
): K[] {
  return [...new Set(fieldKeys)].sort(
    (a, b) =>
      (EVENTS_FIELD_ORDER_INDEX.get(a) ?? Number.MAX_SAFE_INTEGER) -
      (EVENTS_FIELD_ORDER_INDEX.get(b) ?? Number.MAX_SAFE_INTEGER),
  );
}

export type FieldSetFieldKey<S extends FieldSetName> =
  (typeof FIELD_SETS)[S][number];

/** The fields of `sets`, deduplicated, in the canonical SELECT order. */
export function eventsFieldSetKeys<S extends FieldSetName>(
  ...sets: S[]
): FieldSetFieldKey<S>[] {
  return orderedFieldKeys(sets.flatMap((s) => FIELD_SETS[s]));
}

export const OBSERVATION_FIELD_GROUP_FIELD_NAMES = Object.fromEntries(
  OBSERVATION_FIELD_GROUPS_PUBLIC_API.map((group) => [
    group,
    FIELD_SETS[group],
  ]),
) as {
  [K in ObservationFieldGroupPublicApi]: (typeof FIELD_SETS)[K];
};

/**
 * The field group that returns each v2 observations response key. Exhaustive
 * over the response type, so a new observation field cannot reach the v2 API
 * without being assigned a group. `"enrichment"` keys are always returned (see
 * `observation-field-groups.ts`); `null` keys are never returned.
 */
const OBSERVATION_V2_RESPONSE_KEY_GROUP = {
  id: "core",
  traceId: "core",
  startTime: "core",
  endTime: "core",
  projectId: "core",
  parentObservationId: "core",
  type: "core",
  name: "basic",
  level: "basic",
  statusMessage: "basic",
  version: "basic",
  environment: "basic",
  bookmarked: "basic",
  public: "basic",
  userId: "basic",
  sessionId: "basic",
  isRootObservation: "basic",
  completionStartTime: "time",
  createdAt: "time",
  updatedAt: "time",
  input: "io",
  output: "io",
  metadata: "metadata",
  model: "model",
  internalModelId: "model",
  modelParameters: "model",
  usageDetails: "usage",
  costDetails: "usage",
  providedUsageDetails: "usage",
  providedCostDetails: "usage",
  inputUsage: "usage",
  outputUsage: "usage",
  totalUsage: "usage",
  inputCost: "usage",
  outputCost: "usage",
  totalCost: "usage",
  usagePricingTierId: "usage",
  usagePricingTierName: "usage",
  promptId: "prompt",
  promptName: "prompt",
  promptVersion: "prompt",
  latency: "metrics",
  timeToFirstToken: "metrics",
  traceName: "trace_context",
  tags: "trace_context",
  release: "trace_context",
  modelId: "enrichment",
  inputPrice: "enrichment",
  outputPrice: "enrichment",
  totalPrice: "enrichment",
  toolDefinitions: null,
  toolCalls: null,
  toolCallNames: null,
  skillsAvailable: null,
  skillsResourceLoaded: null,
} satisfies Record<
  keyof EventsObservationPublic,
  ObservationFieldGroupPublicApi | "enrichment" | null
>;

/** Keeps only the keys of `row` that belong to core, enrichment, or `groups`. */
export function pickObservationV2Fields(
  row: EventsObservationPublic,
  groups: readonly ObservationFieldGroupPublicApi[],
): EventsObservationPublic {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => {
      const group: ObservationFieldGroupPublicApi | "enrichment" | null =
        OBSERVATION_V2_RESPONSE_KEY_GROUP[
          key as keyof typeof OBSERVATION_V2_RESPONSE_KEY_GROUP
        ] ?? null;
      return (
        group === "core" ||
        group === "enrichment" ||
        (group !== null && groups.includes(group))
      );
    }),
  ) as EventsObservationPublic;
}
