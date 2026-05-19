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
 */

export const OBSERVATION_FIELD_GROUPS_PUBLIC_API = [
  "core", // Always included: id, traceId, startTime, endTime, projectId, parentObservationId, type
  "basic", // name, level, statusMessage, version, environment, bookmarked, public, userId, sessionId
  "time", // completionStartTime, createdAt, updatedAt
  "io", // input, output
  "metadata", // metadata
  "model", // model + providedModelName (both present), internalModelId, modelParameters
  "usage", // usageDetails, costDetails, totalCost, usagePricingTierId, usagePricingTierName
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
