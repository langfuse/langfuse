/**
 * Vocabulary of observation field groups projected from the events repository.
 *
 * The events repository owns these definitions; features (the v2 public API,
 * blob export, ...) consume them. Two sets exist because the v2 public API
 * contract is deliberately narrower than the broader exporter surface:
 *
 * - OBSERVATION_FIELD_GROUPS_PUBLIC_API: v2 public API contract — the groups that the
 *   v2 observations endpoint can return.
 * - OBSERVATION_FIELD_GROUPS_FULL: the complete set of column groups the
 *   events repository can project, including tool fields that the public API
 *   does not currently expose.
 *
 * Defined in the client-safe domain layer (not inside the server-only
 * repository file) so frontend forms and Zod enums can reference the values
 * without pulling in repository runtime code.
 *
 * Enrichment fields (not driven by the field groups above):
 * - The repository layer adds four enrichment fields to every v2 response row
 *   regardless of the requested `fields`: `modelId`, `inputPrice`,
 *   `outputPrice`, `totalPrice`.
 * - For the v2 public API, the Postgres lookup that populates them only runs
 *   when `"model"` is in `fields`; otherwise the fields are returned as null.
 * - For the blob export path `"model"` triggers selection of the `model_export`
 *   SQL field set so pricing can be enriched into the usage payload.
 * - Code references:
 *   - packages/shared/src/server/repositories/events.ts:
 *     `enrichObservationsWithModelData` (v2 read path) and the export
 *     streaming path that gates `model_export`.
 *   - packages/shared/src/server/queries/clickhouse-sql/event-query-builder.ts:
 *     `FIELD_SETS` and `EVENTS_FIELDS` for the underlying column projections.
 */

export const OBSERVATION_FIELD_GROUPS_PUBLIC_API = [
  "core", // Always included: id, traceId, startTime, endTime, projectId, parentObservationId, type
  "basic", // name, level, statusMessage, version, environment, bookmarked, public, userId, sessionId
  "time", // completionStartTime, createdAt, updatedAt
  "io", // input, output
  "metadata", // metadata
  "model", // providedModelName, internalModelId, modelParameters
  "usage", // usageDetails, costDetails, totalCost, usagePricingTierName
  "prompt", // promptId, promptName, promptVersion
  "metrics", // latency, timeToFirstToken
  "trace_context", // tags, release, traceName (denormalized trace metadata)
] as const;

export type ObservationFieldGroupPublicApi =
  (typeof OBSERVATION_FIELD_GROUPS_PUBLIC_API)[number];

export const OBSERVATION_FIELD_GROUPS_FULL = [
  ...OBSERVATION_FIELD_GROUPS_PUBLIC_API,
  "tools", // toolDefinitions, toolCalls, toolCallNames
] as const;

export type ObservationFieldGroupFull =
  (typeof OBSERVATION_FIELD_GROUPS_FULL)[number];

/**
 * Blob export contract for the legacy observations table: every output field
 * of the export and the field group it belongs to, in the column order of the
 * full export (kept stable so exports with all groups selected are unchanged).
 *
 * Field names are the snake_case output columns of the export rows. Groups
 * missing from this list (trace_context) have no counterpart in the legacy
 * table: denormalized trace fields only exist on the events table. The SQL
 * realization (computed expressions for latency, time_to_first_token,
 * model_id) lives in the repository layer:
 * packages/shared/src/server/repositories/observations.ts,
 * `getObservationsForBlobStorageExport`.
 */
export const LEGACY_OBSERVATION_EXPORT_FIELDS: ReadonlyArray<{
  field: string;
  group: ObservationFieldGroupFull;
}> = [
  { field: "id", group: "core" },
  { field: "trace_id", group: "core" },
  { field: "project_id", group: "core" },
  { field: "environment", group: "basic" },
  { field: "type", group: "core" },
  { field: "parent_observation_id", group: "core" },
  { field: "start_time", group: "core" },
  { field: "end_time", group: "core" },
  { field: "name", group: "basic" },
  { field: "metadata", group: "metadata" },
  { field: "level", group: "basic" },
  { field: "status_message", group: "basic" },
  { field: "version", group: "basic" },
  { field: "input", group: "io" },
  { field: "output", group: "io" },
  { field: "provided_model_name", group: "model" },
  { field: "model_parameters", group: "model" },
  { field: "usage_details", group: "usage" },
  { field: "cost_details", group: "usage" },
  { field: "completion_start_time", group: "time" },
  { field: "prompt_name", group: "prompt" },
  { field: "prompt_version", group: "prompt" },
  { field: "total_cost", group: "usage" },
  { field: "latency", group: "metrics" },
  { field: "time_to_first_token", group: "metrics" },
  { field: "model_id", group: "model" },
  { field: "created_at", group: "time" },
  { field: "updated_at", group: "time" },
  { field: "prompt_id", group: "prompt" },
  { field: "tool_calls", group: "tools" },
  { field: "tool_call_names", group: "tools" },
  { field: "tool_definitions", group: "tools" },
  { field: "usage_pricing_tier_name", group: "usage" },
];
