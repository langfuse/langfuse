import type { FilterCondition, FilterState } from "@langfuse/shared";

/**
 * Properties a tree span can supply for the sample filters. Missing columns
 * are dropped when a span is chosen, then the sample list is queried again.
 */
export type SpanProperties = {
  id: string;
  traceId?: string | null;
  name?: string | null;
  traceName?: string | null;
  type?: string | null;
  environment?: string | null;
  level?: string | null;
  statusMessage?: string | null;
  providedModelName?: string | null;
  modelId?: string | null;
  promptName?: string | null;
  promptVersion?: number | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  latency?: number | null;
  timeToFirstToken?: number | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  inputCost?: number | null;
  outputCost?: number | null;
  totalCost?: number | null;
  version?: string | null;
  release?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  traceTags?: string[] | null;
  metadata?: Record<string, unknown> | null;
  parentObservationId?: string | null;
};

export type ObservationTreeHint = "tested" | "also" | "skipped";

type ObservationLike = {
  id: string;
  traceId?: string | null;
  name?: string | null;
  type?: string | null;
  environment?: string | null;
  level?: string | null;
  metadata?: string | Record<string, unknown> | null;
  parentObservationId?: string | null;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  latency?: number | null;
  model?: string | null;
  internalModelId?: string | null;
  promptName?: string | null;
  promptVersion?: number | null;
  version?: string | null;
  statusMessage?: string | null;
  inputUsage?: number | null;
  outputUsage?: number | null;
  totalUsage?: number | null;
  inputCost?: unknown;
  outputCost?: unknown;
  totalCost?: unknown;
  timeToFirstToken?: number | null;
  traceName?: string | null;
  traceTags?: string[] | null;
  userId?: string | null;
  sessionId?: string | null;
  release?: string | null;
};

type TraceLike = {
  name?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  release?: string | null;
  tags?: string[] | null;
  environment?: string | null;
} | null;

const COLUMN_VALUE: Record<string, (span: SpanProperties) => unknown> = {
  id: (span) => span.id,
  traceId: (span) => span.traceId,
  name: (span) => span.name,
  traceName: (span) => span.traceName,
  type: (span) => span.type,
  environment: (span) => span.environment,
  level: (span) => span.level,
  statusMessage: (span) => span.statusMessage,
  providedModelName: (span) => span.providedModelName,
  model: (span) => span.providedModelName,
  modelId: (span) => span.modelId,
  promptName: (span) => span.promptName,
  promptVersion: (span) => span.promptVersion,
  startTime: (span) => span.startTime,
  endTime: (span) => span.endTime,
  latency: (span) => span.latency,
  timeToFirstToken: (span) => span.timeToFirstToken,
  inputTokens: (span) => span.inputTokens,
  outputTokens: (span) => span.outputTokens,
  totalTokens: (span) => span.totalTokens,
  inputCost: (span) => span.inputCost,
  outputCost: (span) => span.outputCost,
  totalCost: (span) => span.totalCost,
  version: (span) => span.version,
  release: (span) => span.release,
  userId: (span) => span.userId,
  sessionId: (span) => span.sessionId,
  traceTags: (span) => span.traceTags,
  tags: (span) => span.traceTags,
  metadata: (span) => span.metadata,
  isRootObservation: (span) => isRoot(span),
  hasParentObservation: (span) => !isRoot(span),
};

function isRoot(span: SpanProperties) {
  return span.parentObservationId == null || span.parentObservationId === "";
}

function readColumn(
  span: SpanProperties,
  column: string,
): { known: true; value: unknown } | { known: false } {
  const read = COLUMN_VALUE[column];
  if (!read) return { known: false };
  const value = read(span);
  return { known: true, value: value ?? null };
}

function metadataRecord(metadata: unknown): Record<string, unknown> | null {
  if (metadata == null) return null;
  if (typeof metadata === "string") {
    try {
      return metadataRecord(JSON.parse(metadata) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as Record<string, unknown>;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    value != null &&
    typeof value === "object" &&
    "toNumber" in value &&
    typeof value.toNumber === "function"
  ) {
    const next = (value.toNumber as () => unknown)();
    return typeof next === "number" && Number.isFinite(next) ? next : null;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const next = Number(value);
    return Number.isFinite(next) ? next : null;
  }
  return null;
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}

function stringList(value: unknown): string[] {
  if (typeof value === "string") {
    return value.trim() ? [value] : [];
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return [String(value)];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (item == null ? "" : String(item).trim()))
    .filter((item) => item.length > 0);
}

function text(value: unknown) {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
}

function keyedValue(
  span: SpanProperties,
  column: string,
  key: string,
): unknown {
  const columnValue = readColumn(span, column);
  if (!columnValue.known || columnValue.value == null) return undefined;
  if (
    typeof columnValue.value !== "object" ||
    Array.isArray(columnValue.value)
  ) {
    return undefined;
  }
  if (!Object.prototype.hasOwnProperty.call(columnValue.value, key)) {
    return undefined;
  }
  return (columnValue.value as Record<string, unknown>)[key];
}

function stringMatches(
  fieldValue: unknown,
  filterValue: string,
  operator: string,
) {
  const value = text(fieldValue);
  if (operator === "=") return value === filterValue;
  if (operator === "contains" || operator === "matches") {
    return value.includes(filterValue);
  }
  if (operator === "does not contain") return !value.includes(filterValue);
  if (operator === "starts with") return value.startsWith(filterValue);
  if (operator === "ends with") return value.endsWith(filterValue);
  if (operator === "is not empty") return value.length > 0;
  return false;
}

function numberMatches(
  fieldValue: unknown,
  filterValue: number,
  operator: string,
) {
  const value = toNumber(fieldValue);
  if (value == null) return false;
  if (operator === "=") return value === filterValue;
  if (operator === ">") return value > filterValue;
  if (operator === "<") return value < filterValue;
  if (operator === ">=") return value >= filterValue;
  if (operator === "<=") return value <= filterValue;
  return false;
}

function dateMatches(
  fieldValue: unknown,
  filterValue: unknown,
  operator: string,
) {
  const value = toDate(fieldValue);
  const target = toDate(filterValue);
  if (!value || !target) return false;
  const left = value.getTime();
  const right = target.getTime();
  if (operator === ">") return left > right;
  if (operator === "<") return left < right;
  if (operator === ">=") return left >= right;
  if (operator === "<=") return left <= right;
  return false;
}

function optionsMatch(
  fieldValue: unknown,
  filterValues: string[],
  operator: string,
) {
  const value = text(fieldValue);
  if (operator === "any of") return filterValues.includes(value);
  if (operator === "none of") return !filterValues.includes(value);
  return false;
}

function arrayMatches(
  fieldValue: unknown,
  filterValues: string[],
  operator: string,
) {
  if (!Array.isArray(fieldValue)) return false;
  const values = fieldValue.map((item) => String(item));
  if (operator === "any of") {
    return values.some((value) => filterValues.includes(value));
  }
  if (operator === "none of") {
    return !values.some((value) => filterValues.includes(value));
  }
  if (operator === "all of") {
    return filterValues.every((value) => values.includes(value));
  }
  return false;
}

function matchesCondition(span: SpanProperties, filter: FilterCondition) {
  if (filter.type === "positionInTrace") {
    if (filter.key === "root") return isRoot(span);
    return false;
  }
  if (
    filter.type === "stringObject" ||
    filter.type === "numberObject" ||
    filter.type === "booleanObject" ||
    filter.type === "categoryOptions"
  ) {
    const value = keyedValue(span, filter.column, filter.key);
    if (filter.type === "stringObject") {
      if (filter.operator === "is set") return value !== undefined;
      if (filter.operator === "is not set") return value === undefined;
      if (value === undefined) return false;
      const stored = typeof value === "string" ? value : JSON.stringify(value);
      return stringMatches(stored, filter.value, filter.operator);
    }
    if (filter.type === "numberObject") {
      return numberMatches(value, filter.value, filter.operator);
    }
    if (filter.type === "booleanObject") {
      if (filter.operator === "=") return value === filter.value;
      if (filter.operator === "<>") return value !== filter.value;
      return false;
    }
    return optionsMatch(value, filter.value, filter.operator);
  }

  const column = readColumn(span, filter.column);
  if (!column.known) return false;
  if (filter.type === "string") {
    return stringMatches(column.value, filter.value, filter.operator);
  }
  if (filter.type === "stringOptions") {
    return optionsMatch(column.value, filter.value, filter.operator);
  }
  if (filter.type === "arrayOptions") {
    return arrayMatches(column.value, filter.value, filter.operator);
  }
  if (filter.type === "number") {
    return numberMatches(column.value, filter.value, filter.operator);
  }
  if (filter.type === "boolean") {
    if (filter.operator === "=") return column.value === filter.value;
    if (filter.operator === "<>") return column.value !== filter.value;
    return false;
  }
  if (filter.type === "datetime") {
    return dateMatches(column.value, filter.value, filter.operator);
  }
  if (filter.type === "null") {
    const empty = column.value == null || column.value === "";
    if (filter.operator === "is null") return empty;
    if (filter.operator === "is not null") return !empty;
  }
  return false;
}

export function spanMatchesFilters(span: SpanProperties, filters: FilterState) {
  return filters.every((filter) => matchesCondition(span, filter));
}

function inclusiveBound(operator: ">" | "<" | ">=" | "<=") {
  if (operator === ">") return ">=";
  if (operator === "<") return "<=";
  return operator;
}

function rewriteFilter(
  filter: FilterCondition,
  span: SpanProperties,
): FilterCondition | null {
  if (filter.type === "positionInTrace") {
    if (filter.key === "root" && isRoot(span)) return filter;
    return null;
  }
  if (filter.type === "stringObject") {
    const value = keyedValue(span, filter.column, filter.key);
    if (value === undefined) return null;
    if (value == null || value === "") {
      return { ...filter, operator: "is set" };
    }
    const stored = typeof value === "string" ? value : JSON.stringify(value);
    const operator =
      filter.operator === "does not contain" ||
      filter.operator === "is set" ||
      filter.operator === "is not set"
        ? "="
        : filter.operator;
    return { ...filter, operator, value: stored };
  }
  if (filter.type === "numberObject") {
    const value = toNumber(keyedValue(span, filter.column, filter.key));
    if (value == null) return null;
    return { ...filter, operator: "=", value };
  }
  if (filter.type === "booleanObject") {
    const value = keyedValue(span, filter.column, filter.key);
    if (typeof value !== "boolean") return null;
    return { ...filter, operator: "=", value };
  }
  if (filter.type === "categoryOptions") {
    const value = stringList(keyedValue(span, filter.column, filter.key));
    if (value.length === 0) return null;
    return { ...filter, operator: "any of", value };
  }

  const column = readColumn(span, filter.column);
  if (!column.known || column.value == null || column.value === "") return null;

  if (filter.type === "string") {
    const value = text(column.value);
    if (!value) return null;
    const operator =
      filter.operator === "does not contain" ? "=" : filter.operator;
    return { ...filter, operator, value };
  }
  if (filter.type === "stringOptions") {
    const value = stringList(column.value);
    if (value.length === 0) return null;
    return { ...filter, operator: "any of", value };
  }
  if (filter.type === "arrayOptions") {
    const value = stringList(column.value);
    if (value.length === 0) return null;
    const operator = filter.operator === "none of" ? "any of" : filter.operator;
    return { ...filter, operator, value };
  }
  if (filter.type === "number") {
    const value = toNumber(column.value);
    if (value == null) return null;
    return { ...filter, operator: "=", value };
  }
  if (filter.type === "boolean") {
    if (typeof column.value !== "boolean") return null;
    return { ...filter, operator: "=", value: column.value };
  }
  if (filter.type === "datetime") {
    const value = toDate(column.value);
    if (!value) return null;
    return { ...filter, operator: inclusiveBound(filter.operator), value };
  }
  if (filter.type === "null") {
    const empty = column.value == null || column.value === "";
    return { ...filter, operator: empty ? "is null" : "is not null" };
  }
  return null;
}

export function filtersFromSpan(filters: FilterState, span: SpanProperties) {
  const next: FilterState = [];
  for (const filter of filters) {
    const rewritten = rewriteFilter(filter, span);
    if (rewritten) next.push(rewritten);
  }
  return next;
}

export function observationTreeHints(
  spans: SpanProperties[],
  filters: FilterState,
  testedId: string | null,
) {
  const matchingIds = new Set(
    spans
      .filter((span) => spanMatchesFilters(span, filters))
      .map((span) => span.id),
  );
  const showAlso = matchingIds.size > 1;
  const hints = new Map<string, ObservationTreeHint>();
  for (const span of spans) {
    if (testedId != null && span.id === testedId) {
      hints.set(span.id, "tested");
      continue;
    }
    if (showAlso && matchingIds.has(span.id)) {
      hints.set(span.id, "also");
      continue;
    }
    if (!matchingIds.has(span.id)) hints.set(span.id, "skipped");
  }
  return hints;
}

export function spanPropertiesFromObservation(
  observation: ObservationLike,
  trace?: TraceLike,
): SpanProperties {
  return {
    id: observation.id,
    traceId: observation.traceId,
    name: observation.name,
    traceName: observation.traceName ?? trace?.name,
    type: observation.type,
    environment: observation.environment ?? trace?.environment,
    level: observation.level,
    statusMessage: observation.statusMessage,
    providedModelName: observation.model,
    modelId: observation.internalModelId,
    promptName: observation.promptName,
    promptVersion: observation.promptVersion,
    startTime: observation.startTime,
    endTime: observation.endTime,
    latency: observation.latency,
    timeToFirstToken: observation.timeToFirstToken,
    inputTokens: observation.inputUsage,
    outputTokens: observation.outputUsage,
    totalTokens: observation.totalUsage,
    inputCost: toNumber(observation.inputCost),
    outputCost: toNumber(observation.outputCost),
    totalCost: toNumber(observation.totalCost),
    version: observation.version,
    release: observation.release ?? trace?.release,
    userId: observation.userId ?? trace?.userId,
    sessionId: observation.sessionId ?? trace?.sessionId,
    traceTags: observation.traceTags ?? trace?.tags,
    metadata: metadataRecord(observation.metadata),
    parentObservationId: observation.parentObservationId,
  };
}
