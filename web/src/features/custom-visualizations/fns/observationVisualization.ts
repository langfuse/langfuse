import {
  type VisualizationDataEnvelope,
  type VisualizationDefinition,
} from "../types";

export type ObservationVisualizationTarget = Record<string, unknown> & {
  id?: string;
  traceId?: string | null;
  parentObservationId?: string | null;
  name?: string | null;
  type?: string | null;
  environment?: string | null;
  level?: string | null;
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
};

const comparableValues = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [value];

const includesValue = (values: unknown[], candidate: unknown) =>
  values.some((value) => value === candidate);

const resolvePath = (value: unknown, path?: string) => {
  if (!path) return value;
  const segments = path
    .replace(/^\$\.?/, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);
  return segments.reduce<unknown>((current, segment) => {
    if (current == null || typeof current !== "object") return undefined;
    return (current as Record<string, unknown>)[segment];
  }, value);
};

const asSearchableString = (value: unknown) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value) ?? "";
  } catch {
    return String(value);
  }
};

const asTimestamp = (value: unknown) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? undefined : timestamp;
  }
  return undefined;
};

const observationFilterValue = (
  observation: ObservationVisualizationTarget,
  filter: VisualizationDefinition["match"]["filters"][number],
) => {
  const { column } = filter;
  if (column === "observationId") return observation.id;
  if (column === "isRootObservation") {
    return observation.parentObservationId == null;
  }
  if (column === "hasInput") return observation.input != null;
  if (column === "hasOutput") return observation.output != null;
  const value = observation[column];
  if (!("key" in filter)) return value;
  return value != null && typeof value === "object"
    ? (value as Record<string, unknown>)[filter.key]
    : undefined;
};

const matchesFilter = (
  observation: ObservationVisualizationTarget,
  filter: VisualizationDefinition["match"]["filters"][number],
) => {
  const actual = observationFilterValue(observation, filter);
  const expected = filter.value;
  const expectedValues = comparableValues(expected);

  if (filter.type === "datetime") {
    const actualTimestamp = asTimestamp(actual);
    const expectedTimestamp = asTimestamp(expected);
    if (actualTimestamp === undefined || expectedTimestamp === undefined) {
      return false;
    }
    if (filter.operator === "<") return actualTimestamp < expectedTimestamp;
    if (filter.operator === "<=") return actualTimestamp <= expectedTimestamp;
    if (filter.operator === ">") return actualTimestamp > expectedTimestamp;
    return actualTimestamp >= expectedTimestamp;
  }

  if ((filter.operator as string) === "matches") {
    return typeof expected === "string"
      ? asSearchableString(actual)
          .toLocaleLowerCase()
          .includes(expected.toLocaleLowerCase())
      : false;
  }

  switch (filter.operator) {
    case "=":
      return includesValue(expectedValues, actual);
    case "<>":
      return !includesValue(expectedValues, actual);
    case "any of":
      return comparableValues(actual).some((value) =>
        includesValue(expectedValues, value),
      );
    case "all of":
      return expectedValues.every((value) =>
        includesValue(comparableValues(actual), value),
      );
    case "none of":
      return comparableValues(actual).every(
        (value) => !includesValue(expectedValues, value),
      );
    case "contains":
      return typeof expected === "string"
        ? asSearchableString(actual).includes(expected)
        : comparableValues(actual).some((value) =>
            includesValue(expectedValues, value),
          );
    case "does not contain":
      return typeof expected === "string"
        ? !asSearchableString(actual).includes(expected)
        : comparableValues(actual).every(
            (value) => !includesValue(expectedValues, value),
          );
    case "starts with":
      return (
        typeof expected === "string" &&
        asSearchableString(actual).startsWith(expected)
      );
    case "ends with":
      return (
        typeof expected === "string" &&
        asSearchableString(actual).endsWith(expected)
      );
    case "is null":
      return actual === null;
    case "is not null":
      return actual !== null;
    case "is set":
      return actual !== null && actual !== undefined;
    case "is not set":
      return actual === null || actual === undefined;
    case "is not empty": {
      if (Array.isArray(actual)) return actual.length > 0;
      if (typeof actual === "string") return actual.length > 0;
      return actual !== null && actual !== undefined;
    }
    case "<":
      return typeof actual === "number" && typeof expected === "number"
        ? actual < expected
        : false;
    case "<=":
      return typeof actual === "number" && typeof expected === "number"
        ? actual <= expected
        : false;
    case ">":
      return typeof actual === "number" && typeof expected === "number"
        ? actual > expected
        : false;
    case ">=":
      return typeof actual === "number" && typeof expected === "number"
        ? actual >= expected
        : false;
    default:
      return false;
  }
};

export const matchesObservationVisualization = (
  definition: VisualizationDefinition,
  observation: ObservationVisualizationTarget,
) => {
  if (definition.match.entity !== "OBSERVATION") return false;
  if (definition.placement.surface !== "SESSION") return false;
  if (
    definition.binding.source !== "OBSERVATION_INPUT" &&
    definition.binding.source !== "OBSERVATION_OUTPUT"
  ) {
    return false;
  }

  const { anchor } = definition.placement;
  if (definition.match.filters.length === 0) {
    if (anchor.observationType && anchor.observationType !== observation.type) {
      return false;
    }
    if (anchor.observationName && anchor.observationName !== observation.name) {
      return false;
    }
  }
  return definition.match.filters.every((filter) =>
    matchesFilter(observation, filter),
  );
};

export const matchesTraceVisualization = (
  definition: VisualizationDefinition,
  rootObservation: ObservationVisualizationTarget,
) => {
  if (definition.match.entity !== "TRACE") return false;
  if (definition.placement.surface !== "TRACE") return false;
  if (definition.binding.source !== "TRACE") return false;
  return definition.match.filters.every((filter) =>
    matchesFilter(rootObservation, filter),
  );
};

export const buildObservationVisualizationData = (
  definition: VisualizationDefinition,
  observation: ObservationVisualizationTarget,
): VisualizationDataEnvelope => {
  const sourceValue =
    definition.binding.source === "OBSERVATION_INPUT"
      ? observation.input
      : observation.output;
  return {
    envelopeVersion: "1",
    data: {
      observation,
      observations: [observation],
      selectedValue: resolvePath(sourceValue, definition.binding.jsonPath),
    },
    meta: {
      surface: "SESSION",
      source: definition.binding.source,
    },
    scores: [],
  };
};

export const buildTraceVisualizationData = (
  definition: VisualizationDefinition,
  trace: Record<string, unknown>,
  observations: ObservationVisualizationTarget[],
  scores: VisualizationDataEnvelope["scores"] = [],
): VisualizationDataEnvelope => ({
  envelopeVersion: "1",
  data: {
    trace,
    observations,
    selectedValue: resolvePath(trace, definition.binding.jsonPath),
  },
  meta: { surface: "TRACE", source: "TRACE" },
  scores,
});
