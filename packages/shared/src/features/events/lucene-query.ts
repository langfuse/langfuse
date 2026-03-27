import isEqual from "lodash/isEqual";
import luceneParser, {
  type LuceneBinaryNode,
  type LuceneNode,
  type LuceneRangeNode,
} from "./hyperdx-lucene";
import { InvalidRequestError } from "../../errors";
import type { TracingSearchType } from "../../interfaces/search";
import type {
  FilterCondition,
  FilterExpression,
  FilterState,
} from "../../types";

export type EventsLuceneFieldKind = "text" | "number" | "datetime" | "boolean";

export type EventsLuceneFieldId =
  | "id"
  | "traceId"
  | "name"
  | "traceName"
  | "type"
  | "environment"
  | "userId"
  | "sessionId"
  | "level"
  | "statusMessage"
  | "modelId"
  | "providedModelName"
  | "promptName"
  | "promptVersion"
  | "startTime"
  | "endTime"
  | "latency"
  | "timeToFirstToken"
  | "inputTokens"
  | "outputTokens"
  | "totalTokens"
  | "inputCost"
  | "outputCost"
  | "version"
  | "traceTags"
  | "hasParentObservation"
  | "experimentDatasetId"
  | "experimentId"
  | "experimentName"
  | "input"
  | "output";

export type EventsLuceneFieldRef =
  | {
      type: "field";
      id: EventsLuceneFieldId;
    }
  | {
      type: "metadata";
      key: string;
    };

export type EventsLuceneExpression =
  | {
      type: "group";
      operator: "AND" | "OR";
      conditions: EventsLuceneExpression[];
    }
  | {
      type: "not";
      condition: EventsLuceneExpression;
    }
  | {
      type: "text";
      field: EventsLuceneFieldRef | null;
      value: string;
      quoted: boolean;
      wildcard: boolean;
      exists: boolean;
    }
  | {
      type: "range";
      field: EventsLuceneFieldRef;
      min: string | null;
      max: string | null;
      inclusiveMin: boolean;
      inclusiveMax: boolean;
    };

export type EventsLuceneValidationResult =
  | {
      isValid: true;
      expression?: EventsLuceneExpression;
    }
  | {
      isValid: false;
      error: string;
    };

export type EventsLuceneApiQueryResult =
  | {
      isValid: true;
      expression?: EventsLuceneExpression;
      filter?: FilterExpression;
      searchQuery?: string;
      searchType?: TracingSearchType[];
    }
  | {
      isValid: false;
      error: string;
    };

type EventsLuceneFieldDefinition = {
  id: EventsLuceneFieldId;
  aliases: string[];
  kind: EventsLuceneFieldKind;
  bareSearchable: boolean;
  syncMode: "exactOption" | "arrayOption" | "textSearch";
  description: string;
};

const EVENTS_LUCENE_FIELDS: EventsLuceneFieldDefinition[] = [
  {
    id: "id",
    aliases: ["id", "spanid", "span_id", "observationid", "observation_id"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Observation/span identifier",
  },
  {
    id: "traceId",
    aliases: ["traceid", "trace_id"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Trace identifier",
  },
  {
    id: "name",
    aliases: ["name"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Observation name",
  },
  {
    id: "traceName",
    aliases: ["tracename", "trace_name"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Trace name",
  },
  {
    id: "type",
    aliases: ["type"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Observation type",
  },
  {
    id: "environment",
    aliases: ["environment", "env"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Environment",
  },
  {
    id: "userId",
    aliases: ["userid", "user_id"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Trace user id",
  },
  {
    id: "sessionId",
    aliases: ["sessionid", "session_id"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Trace session id",
  },
  {
    id: "level",
    aliases: ["level"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Observation level",
  },
  {
    id: "statusMessage",
    aliases: ["statusmessage", "status_message", "status"],
    kind: "text",
    bareSearchable: true,
    syncMode: "textSearch",
    description: "Status message",
  },
  {
    id: "modelId",
    aliases: ["modelid", "model_id"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Internal model id",
  },
  {
    id: "providedModelName",
    aliases: ["providedmodelname", "provided_model_name", "model"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Provided model name",
  },
  {
    id: "promptName",
    aliases: ["promptname", "prompt_name"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Prompt name",
  },
  {
    id: "promptVersion",
    aliases: ["promptversion", "prompt_version"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Prompt version",
  },
  {
    id: "startTime",
    aliases: ["starttime", "start_time"],
    kind: "datetime",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Observation start time",
  },
  {
    id: "endTime",
    aliases: ["endtime", "end_time"],
    kind: "datetime",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Observation end time",
  },
  {
    id: "latency",
    aliases: ["latency"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Observation latency in seconds",
  },
  {
    id: "timeToFirstToken",
    aliases: ["timetofirsttoken", "time_to_first_token", "ttft"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Time to first token in seconds",
  },
  {
    id: "inputTokens",
    aliases: ["inputtokens", "input_tokens"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Input token count",
  },
  {
    id: "outputTokens",
    aliases: ["outputtokens", "output_tokens"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Output token count",
  },
  {
    id: "totalTokens",
    aliases: ["totaltokens", "total_tokens", "tokens"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Total token count",
  },
  {
    id: "inputCost",
    aliases: ["inputcost", "input_cost"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Input cost",
  },
  {
    id: "outputCost",
    aliases: ["outputcost", "output_cost"],
    kind: "number",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Output cost",
  },
  {
    id: "version",
    aliases: ["version"],
    kind: "text",
    bareSearchable: true,
    syncMode: "exactOption",
    description: "Version tag",
  },
  {
    id: "traceTags",
    aliases: ["tracetags", "trace_tags", "tags"],
    kind: "text",
    bareSearchable: false,
    syncMode: "arrayOption",
    description: "Trace tags",
  },
  {
    id: "hasParentObservation",
    aliases: [
      "hasparentobservation",
      "has_parent_observation",
      "isrootobservation",
      "is_root_observation",
    ],
    kind: "boolean",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Whether the observation has a parent observation",
  },
  {
    id: "experimentDatasetId",
    aliases: ["experimentdatasetid", "experiment_dataset_id"],
    kind: "text",
    bareSearchable: false,
    syncMode: "exactOption",
    description: "Experiment dataset identifier",
  },
  {
    id: "experimentId",
    aliases: ["experimentid", "experiment_id"],
    kind: "text",
    bareSearchable: false,
    syncMode: "exactOption",
    description: "Experiment identifier",
  },
  {
    id: "experimentName",
    aliases: ["experimentname", "experiment_name"],
    kind: "text",
    bareSearchable: false,
    syncMode: "exactOption",
    description: "Experiment name",
  },
  {
    id: "input",
    aliases: ["input"],
    kind: "text",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Observation input",
  },
  {
    id: "output",
    aliases: ["output"],
    kind: "text",
    bareSearchable: false,
    syncMode: "textSearch",
    description: "Observation output",
  },
] as const;

const EVENTS_LUCENE_FIELD_LOOKUP = EVENTS_LUCENE_FIELDS.reduce<
  Record<string, EventsLuceneFieldDefinition>
>((acc, field) => {
  for (const alias of field.aliases) {
    acc[alias] = field;
  }

  return acc;
}, {});

const EVENTS_LUCENE_SEARCH_TYPE: TracingSearchType[] = ["id", "content"];
const SIMPLE_FREE_TEXT_RESERVED_PATTERN = /["()[\]{}*?]/;
const EXPLICIT_BOOLEAN_OPERATOR_PATTERN = /\b(?:AND|OR|NOT)\b/;
const LUCENE_FIELD_LOOKING_PATTERN =
  /(^|\s)[A-Za-z_][A-Za-z0-9_.-]*:(?!\/\/)\S+/i;

type RawLuceneNode = LuceneNode;
type RawLuceneRangeNode = LuceneRangeNode;
type RawLuceneBinaryNode = LuceneBinaryNode;

function isRawLuceneRangeNode(node: RawLuceneNode): node is RawLuceneRangeNode {
  return "term_min" in node;
}

function isRawLuceneBinaryNode(
  node: RawLuceneNode,
): node is RawLuceneBinaryNode {
  return "left" in node && !("term" in node) && !("term_min" in node);
}

function getInvalidLuceneQueryError(message: string): InvalidRequestError {
  return new InvalidRequestError(`Invalid Lucene query: ${message}`);
}

function resolveEventsLuceneField(
  rawField: string | null | undefined,
): EventsLuceneFieldRef | null {
  if (!rawField || rawField === "<implicit>") {
    return null;
  }

  if (/[*?]/.test(rawField)) {
    throw getInvalidLuceneQueryError(
      "Field wildcards are not supported in events search.",
    );
  }

  const normalizedField = rawField.trim().toLowerCase();

  if (normalizedField.startsWith("metadata.")) {
    const metadataKey = rawField.slice("metadata.".length).trim();

    if (!metadataKey) {
      throw getInvalidLuceneQueryError(
        "Metadata queries must use metadata.<key>:<value> syntax.",
      );
    }

    return {
      type: "metadata",
      key: metadataKey,
    };
  }

  const fieldDefinition = EVENTS_LUCENE_FIELD_LOOKUP[normalizedField];

  if (!fieldDefinition) {
    throw getInvalidLuceneQueryError(
      `Unsupported field "${rawField}". Supported fields: ${getEventsLuceneSupportedFields().join(", ")}, metadata.<key>.`,
    );
  }

  return {
    type: "field",
    id: fieldDefinition.id,
  };
}

function getFieldKind(
  field: EventsLuceneFieldRef | null,
): EventsLuceneFieldKind {
  if (!field) {
    return "text";
  }

  if (field.type === "metadata") {
    return "text";
  }

  return EVENTS_LUCENE_FIELDS.find((candidate) => candidate.id === field.id)!
    .kind;
}

function getFieldDefinitionById(
  fieldId: EventsLuceneFieldId,
): EventsLuceneFieldDefinition {
  return EVENTS_LUCENE_FIELDS.find((candidate) => candidate.id === fieldId)!;
}

function getFieldDefinition(
  field: EventsLuceneFieldRef | null,
): EventsLuceneFieldDefinition | undefined {
  if (!field || field.type === "metadata") {
    return undefined;
  }

  return getFieldDefinitionById(field.id);
}

function getFieldSyncMode(
  field: EventsLuceneFieldRef | null,
): EventsLuceneFieldDefinition["syncMode"] {
  return getFieldDefinition(field)?.syncMode ?? "textSearch";
}

function createGroupExpression(
  operator: "AND" | "OR",
  left: EventsLuceneExpression,
  right: EventsLuceneExpression,
): EventsLuceneExpression {
  const conditions: EventsLuceneExpression[] = [];

  if (left.type === "group" && left.operator === operator) {
    conditions.push(...left.conditions);
  } else {
    conditions.push(left);
  }

  if (right.type === "group" && right.operator === operator) {
    conditions.push(...right.conditions);
  } else {
    conditions.push(right);
  }

  return {
    type: "group",
    operator,
    conditions,
  };
}

function normalizeRawLuceneNode(node: RawLuceneNode): EventsLuceneExpression {
  if (isRawLuceneBinaryNode(node)) {
    if (node.start === "NOT") {
      return {
        type: "not",
        condition: normalizeRawLuceneNode(node.left),
      };
    }

    if (!node.right || !node.operator) {
      return normalizeRawLuceneNode(node.left);
    }

    if (node.operator === "AND NOT" || node.operator === "OR NOT") {
      const normalizedOperator = node.operator === "AND NOT" ? "AND" : "OR";

      return createGroupExpression(
        normalizedOperator,
        normalizeRawLuceneNode(node.left),
        {
          type: "not",
          condition: normalizeRawLuceneNode(node.right),
        },
      );
    }

    return createGroupExpression(
      node.operator === "<implicit>" ? "OR" : node.operator,
      normalizeRawLuceneNode(node.left),
      normalizeRawLuceneNode(node.right),
    );
  }

  if (isRawLuceneRangeNode(node)) {
    const field = resolveEventsLuceneField(node.field);

    if (!field) {
      throw getInvalidLuceneQueryError(
        "Range queries must target an explicit field.",
      );
    }

    if (field.type === "metadata") {
      throw getInvalidLuceneQueryError(
        "Metadata range queries are not supported.",
      );
    }

    const fieldKind = getFieldKind(field);
    if (fieldKind === "text") {
      throw getInvalidLuceneQueryError(
        `Range queries are only supported on numeric and datetime fields. "${field.id}" is a text field.`,
      );
    }

    return {
      type: "range",
      field,
      min: node.term_min === "*" ? null : node.term_min,
      max: node.term_max === "*" ? null : node.term_max,
      inclusiveMin: node.inclusive === "both" || node.inclusive === "left",
      inclusiveMax: node.inclusive === "both" || node.inclusive === "right",
    };
  }

  if (node.prefix) {
    throw getInvalidLuceneQueryError(
      'Leading "+" / "-" operators are not supported. Use explicit AND / NOT instead.',
    );
  }

  if (
    "proximity" in node &&
    node.proximity !== null &&
    node.proximity !== undefined
  ) {
    throw getInvalidLuceneQueryError(
      "Phrase proximity search is not supported in events search.",
    );
  }

  if (
    "similarity" in node &&
    node.similarity !== null &&
    node.similarity !== undefined
  ) {
    throw getInvalidLuceneQueryError(
      "Fuzzy search is not supported in events search.",
    );
  }

  if ("boost" in node && node.boost !== null && node.boost !== undefined) {
    throw getInvalidLuceneQueryError(
      "Boost operators are not supported in events search.",
    );
  }

  if (node.regex || /^\/.*\/$/.test(node.term)) {
    throw getInvalidLuceneQueryError(
      "Regex search is not supported in events search.",
    );
  }

  const field = resolveEventsLuceneField(node.field);

  if (node.term === "*" && !field) {
    throw getInvalidLuceneQueryError(
      "Existence queries must target an explicit field, for example statusMessage:*.",
    );
  }

  const wildcard = /[*?]/.test(node.term);
  const exists = node.term === "*";

  if (field && !exists && getFieldKind(field) !== "text") {
    const fieldKind = getFieldKind(field);

    if (node.quoted) {
      throw getInvalidLuceneQueryError(
        `Field "${field.type === "field" ? field.id : `metadata.${field.key}`}" does not support quoted values in the Lucene bar.`,
      );
    }

    // Numeric and boolean equality are allowed for unquoted exact values only.
    if (fieldKind !== "number" && fieldKind !== "boolean") {
      throw getInvalidLuceneQueryError(
        `Field "${field.type === "field" ? field.id : `metadata.${field.key}`}" only supports range queries in the Lucene bar.`,
      );
    }
  }

  return {
    type: "text",
    field,
    value: node.term,
    quoted: node.quoted,
    wildcard,
    exists,
  };
}

export function getEventsLuceneSupportedFields(): string[] {
  return EVENTS_LUCENE_FIELDS.map((field) => field.id);
}

export function getEventsLuceneBareSearchableFields(): EventsLuceneFieldId[] {
  return EVENTS_LUCENE_FIELDS.filter((field) => field.bareSearchable).map(
    (field) => field.id,
  );
}

export function getEventsLuceneFieldKindById(
  fieldId: EventsLuceneFieldId,
): EventsLuceneFieldKind {
  return getFieldDefinitionById(fieldId).kind;
}

export function extractEventsLuceneFlatFilterState(
  filterExpression: FilterExpression | undefined,
): FilterState | undefined {
  return extractEventsLuceneSyncableFilterState(filterExpression);
}

export function extractEventsLuceneSyncableFilterState(
  filterExpression: FilterExpression | undefined,
): FilterState | undefined {
  const syncableConditions = extractSyncableFilterConditions(filterExpression);

  if (!syncableConditions || syncableConditions.length === 0) {
    return undefined;
  }

  return syncableConditions;
}

export function getEventsLuceneSerializableFilterState(
  filterState: FilterState,
): FilterState {
  return filterState.filter((filter) =>
    isEventsLuceneSerializableFilterCondition(filter),
  );
}

export function serializeEventsLuceneFilterState(
  filterState: FilterState,
): string | undefined {
  if (filterState.length === 0) {
    return undefined;
  }

  const serializedConditions = filterState.map((filter) =>
    serializeEventsLuceneFilterCondition(filter),
  );

  if (serializedConditions.some((condition) => !condition)) {
    return undefined;
  }

  return serializedConditions.join(" AND ");
}

export const EVENTS_LUCENE_QUERY_EXAMPLES = [
  'name:"chat completion" AND level:error',
  'name:"weather agent" AND (level:ERROR OR level:WARN)',
  "traceId:trace-123 OR sessionId:session-123",
  "metadata.environment:prod AND input:tool*",
  "promptVersion:3 AND startTime:[2025-01-01 TO 2025-01-31]",
];

function isSimpleFreeTextQuery(query: string): boolean {
  return (
    !SIMPLE_FREE_TEXT_RESERVED_PATTERN.test(query) &&
    !EXPLICIT_BOOLEAN_OPERATOR_PATTERN.test(query) &&
    !LUCENE_FIELD_LOOKING_PATTERN.test(query)
  );
}

function containsExplicitField(
  expression: EventsLuceneExpression | undefined,
): boolean {
  if (!expression) {
    return false;
  }

  if (expression.type === "group") {
    return expression.conditions.some((condition) =>
      containsExplicitField(condition),
    );
  }

  if (expression.type === "not") {
    return containsExplicitField(expression.condition);
  }

  return expression.field !== null;
}

function containsBareTextClause(
  expression: EventsLuceneExpression | undefined,
): boolean {
  if (!expression) {
    return false;
  }

  if (expression.type === "group") {
    return expression.conditions.some((condition) =>
      containsBareTextClause(condition),
    );
  }

  if (expression.type === "not") {
    return containsBareTextClause(expression.condition);
  }

  return expression.type === "text" && expression.field === null;
}

function getFieldLabel(field: EventsLuceneFieldRef): string {
  return field.type === "metadata" ? `metadata.${field.key}` : field.id;
}

function collapseFilterGroup(
  operator: "AND" | "OR",
  conditions: FilterExpression[],
): FilterExpression {
  const flattenedConditions: FilterExpression[] = [];

  for (const condition of conditions) {
    if (condition.type === "group" && condition.operator === operator) {
      flattenedConditions.push(...condition.conditions);
    } else {
      flattenedConditions.push(condition);
    }
  }

  if (flattenedConditions.length === 1) {
    return flattenedConditions[0]!;
  }

  return {
    type: "group",
    operator,
    conditions: flattenedConditions,
  };
}

function dedupeStringValues(values: string[]): string[] {
  return Array.from(new Set(values));
}

function mergeStringOptionFilters(
  left: Extract<FilterCondition, { type: "stringOptions" }>,
  right: Extract<FilterCondition, { type: "stringOptions" }>,
): FilterCondition | undefined {
  const leftValues = dedupeStringValues(left.value);
  const rightValues = dedupeStringValues(right.value);

  if (left.operator === "none of" && right.operator === "none of") {
    return {
      ...left,
      value: dedupeStringValues([...leftValues, ...rightValues]),
    };
  }

  if (left.operator === "any of" && right.operator === "any of") {
    const intersection = leftValues.filter((value) =>
      rightValues.includes(value),
    );

    if (intersection.length === 0) {
      return undefined;
    }

    return {
      ...left,
      value: intersection,
    };
  }

  const anyOfFilter = left.operator === "any of" ? left : right;
  const noneOfFilter = left.operator === "none of" ? left : right;
  const allowedValues = anyOfFilter.value.filter(
    (value) => !noneOfFilter.value.includes(value),
  );

  if (allowedValues.length === 0) {
    return undefined;
  }

  return {
    ...anyOfFilter,
    operator: "any of",
    value: allowedValues,
  };
}

function mergeArrayOptionFilters(
  left: Extract<FilterCondition, { type: "arrayOptions" }>,
  right: Extract<FilterCondition, { type: "arrayOptions" }>,
): FilterCondition | undefined {
  const leftValues = dedupeStringValues(left.value);
  const rightValues = dedupeStringValues(right.value);

  if (left.operator === "none of" && right.operator === "none of") {
    return {
      ...left,
      value: dedupeStringValues([...leftValues, ...rightValues]),
    };
  }

  if (left.operator === "all of" && right.operator === "all of") {
    return {
      ...left,
      value: dedupeStringValues([...leftValues, ...rightValues]),
    };
  }

  if (left.operator === "any of" && right.operator === "any of") {
    if (leftValues.length !== 1 || rightValues.length !== 1) {
      return undefined;
    }

    const combinedValues = dedupeStringValues([...leftValues, ...rightValues]);

    return {
      ...left,
      operator: combinedValues.length > 1 ? "all of" : "any of",
      value: combinedValues,
    };
  }

  return undefined;
}

function mergeCompatibleSyncableFilters(
  currentFilters: FilterState,
  nextFilter: FilterCondition,
): FilterState | undefined {
  if (
    nextFilter.type !== "stringOptions" &&
    nextFilter.type !== "arrayOptions" &&
    nextFilter.type !== "boolean"
  ) {
    return currentFilters.some((candidateFilter) =>
      isEqual(candidateFilter, nextFilter),
    )
      ? currentFilters
      : [...currentFilters, nextFilter];
  }

  const matchingIndex = currentFilters.findIndex(
    (candidateFilter) =>
      candidateFilter.column === nextFilter.column &&
      candidateFilter.type === nextFilter.type,
  );

  if (matchingIndex < 0) {
    return [...currentFilters, nextFilter];
  }

  const matchingFilter = currentFilters[matchingIndex]!;

  if (isEqual(matchingFilter, nextFilter)) {
    return currentFilters;
  }

  let mergedFilter: FilterCondition | undefined;

  if (
    matchingFilter.type === "stringOptions" &&
    nextFilter.type === "stringOptions"
  ) {
    mergedFilter = mergeStringOptionFilters(matchingFilter, nextFilter);
  } else if (
    matchingFilter.type === "arrayOptions" &&
    nextFilter.type === "arrayOptions"
  ) {
    mergedFilter = mergeArrayOptionFilters(matchingFilter, nextFilter);
  } else if (
    matchingFilter.type === "boolean" &&
    nextFilter.type === "boolean" &&
    matchingFilter.operator === nextFilter.operator &&
    matchingFilter.value === nextFilter.value
  ) {
    mergedFilter = matchingFilter;
  }

  if (!mergedFilter) {
    return undefined;
  }

  return currentFilters.map((filter, index) =>
    index === matchingIndex ? mergedFilter : filter,
  );
}

function collapseOrSyncableFilterGroup(expression: {
  type: "group";
  operator: "AND" | "OR";
  conditions: FilterExpression[];
}): FilterState | undefined {
  if (expression.operator !== "OR") {
    return undefined;
  }

  const syncableChildFilters = expression.conditions.map((condition) =>
    extractSyncableFilterConditions(condition),
  );

  if (
    syncableChildFilters.some(
      (childFilters) => !childFilters || childFilters.length !== 1,
    )
  ) {
    return undefined;
  }

  const childFilters = syncableChildFilters.map((filters) => filters![0]!);
  const firstFilter = childFilters[0];

  if (!firstFilter) {
    return undefined;
  }

  if (
    childFilters.some(
      (filter) =>
        filter.type !== firstFilter.type ||
        filter.column !== firstFilter.column,
    )
  ) {
    return undefined;
  }

  if (firstFilter.type === "stringOptions") {
    if (childFilters.some((filter) => filter.operator !== "any of")) {
      return undefined;
    }

    return [
      {
        ...firstFilter,
        value: dedupeStringValues(
          childFilters.flatMap((filter) =>
            filter.type === "stringOptions" ? filter.value : [],
          ),
        ),
      },
    ];
  }

  if (firstFilter.type === "arrayOptions") {
    if (childFilters.some((filter) => filter.operator !== "any of")) {
      return undefined;
    }

    return [
      {
        ...firstFilter,
        value: dedupeStringValues(
          childFilters.flatMap((filter) =>
            filter.type === "arrayOptions" ? filter.value : [],
          ),
        ),
      },
    ];
  }

  if (firstFilter.type === "boolean") {
    if (
      childFilters.every(
        (filter) =>
          filter.type === "boolean" &&
          filter.operator === firstFilter.operator &&
          filter.value === firstFilter.value,
      )
    ) {
      return [firstFilter];
    }
  }

  return undefined;
}

function extractSyncableFilterConditions(
  expression: FilterExpression | undefined,
): FilterState | undefined {
  if (!expression) {
    return undefined;
  }

  if (expression.type !== "group") {
    return isEventsLuceneSerializableFilterCondition(expression)
      ? [expression]
      : undefined;
  }

  if (expression.operator === "OR") {
    return collapseOrSyncableFilterGroup(expression);
  }

  let mergedFilters: FilterState = [];

  for (const condition of expression.conditions) {
    const extractedFilters = extractSyncableFilterConditions(condition);

    if (!extractedFilters) {
      return undefined;
    }

    for (const extractedFilter of extractedFilters) {
      const nextMergedFilters = mergeCompatibleSyncableFilters(
        mergedFilters,
        extractedFilter,
      );

      if (!nextMergedFilters) {
        return undefined;
      }

      mergedFilters = nextMergedFilters;
    }
  }

  return mergedFilters;
}

function getUnsupportedLuceneFilterError(message: string): InvalidRequestError {
  return getInvalidLuceneQueryError(message);
}

function getLuceneFieldPathForFilter(
  filter: FilterCondition,
): string | undefined {
  if (filter.type === "stringObject") {
    if (filter.column !== "metadata") {
      return undefined;
    }

    return `metadata.${filter.key}`;
  }

  if (
    filter.type === "stringOptions" ||
    filter.type === "arrayOptions" ||
    filter.type === "boolean" ||
    filter.type === "string" ||
    filter.type === "number" ||
    filter.type === "datetime" ||
    filter.type === "null"
  ) {
    const normalizedColumn = filter.column.trim().toLowerCase();
    const field = EVENTS_LUCENE_FIELDS.find((candidate) =>
      candidate.aliases.includes(normalizedColumn),
    );

    return field?.id;
  }

  return undefined;
}

function escapeLuceneQuotedValue(value: string): string {
  return value.replace(/([\\"])/g, "\\$1");
}

function escapeLuceneBareValue(value: string): string {
  return value.replace(/([+\-!(){}[\]^"~*?:\\/]|&&|\|\||\s)/g, "\\$1");
}

function formatLuceneContainsValue(value: string): string {
  return `"${escapeLuceneQuotedValue(value)}"`;
}

function formatLuceneExactValue(value: string): string {
  return `"${escapeLuceneQuotedValue(value)}"`;
}

function formatLuceneWildcardValue(value: string): string | undefined {
  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return undefined;
  }

  return escapeLuceneBareValue(trimmedValue);
}

function serializeEventsLuceneFilterCondition(
  filter: FilterCondition,
): string | undefined {
  const fieldPath = getLuceneFieldPathForFilter(filter);

  if (!fieldPath) {
    return undefined;
  }

  if (filter.type === "stringObject") {
    if (filter.operator === "=") {
      return undefined;
    }

    if (filter.operator === "contains") {
      return `${fieldPath}:${formatLuceneContainsValue(filter.value)}`;
    }

    if (filter.operator === "does not contain") {
      return `NOT ${fieldPath}:${formatLuceneContainsValue(filter.value)}`;
    }

    const wildcardValue = formatLuceneWildcardValue(filter.value);

    if (!wildcardValue) {
      return undefined;
    }

    if (filter.operator === "starts with") {
      return `${fieldPath}:${wildcardValue}*`;
    }

    if (filter.operator === "ends with") {
      return `${fieldPath}:*${wildcardValue}`;
    }

    return undefined;
  }

  if (filter.type === "stringOptions") {
    const serializedValues = dedupeStringValues(filter.value).map(
      (value) => `${fieldPath}:${formatLuceneExactValue(value)}`,
    );

    if (serializedValues.length === 0) {
      return undefined;
    }

    if (filter.operator === "any of") {
      return serializedValues.length === 1
        ? serializedValues[0]
        : `(${serializedValues.join(" OR ")})`;
    }

    return serializedValues.length === 1
      ? `NOT ${serializedValues[0]}`
      : `NOT (${serializedValues.join(" OR ")})`;
  }

  if (filter.type === "arrayOptions") {
    const serializedValues = dedupeStringValues(filter.value).map(
      (value) => `${fieldPath}:${formatLuceneExactValue(value)}`,
    );

    if (filter.operator === "all of") {
      return serializedValues.length === 1
        ? serializedValues[0]
        : `(${serializedValues.join(" AND ")})`;
    }

    if (serializedValues.length === 0) {
      return undefined;
    }

    if (filter.operator === "any of") {
      return serializedValues.length === 1
        ? serializedValues[0]
        : `(${serializedValues.join(" OR ")})`;
    }

    return serializedValues.length === 1
      ? `NOT ${serializedValues[0]}`
      : `NOT (${serializedValues.join(" OR ")})`;
  }

  if (filter.type === "string") {
    if (filter.operator === "=") {
      return `${fieldPath}:${formatLuceneExactValue(filter.value)}`;
    }

    if (filter.operator === "contains") {
      return `${fieldPath}:${formatLuceneContainsValue(filter.value)}`;
    }

    if (filter.operator === "does not contain") {
      return `NOT ${fieldPath}:${formatLuceneContainsValue(filter.value)}`;
    }

    const wildcardValue = formatLuceneWildcardValue(filter.value);

    if (!wildcardValue) {
      return undefined;
    }

    if (filter.operator === "starts with") {
      return `${fieldPath}:${wildcardValue}*`;
    }

    if (filter.operator === "ends with") {
      return `${fieldPath}:*${wildcardValue}`;
    }

    return undefined;
  }

  if (filter.type === "boolean") {
    if (filter.operator === "=") {
      return `${fieldPath}:${String(filter.value)}`;
    }

    return `${fieldPath}:${String(!filter.value)}`;
  }

  if (filter.type === "null") {
    return filter.operator === "is not null"
      ? `${fieldPath}:*`
      : `NOT ${fieldPath}:*`;
  }

  if (filter.type === "number") {
    if (filter.operator === "=") {
      return `${fieldPath}:${filter.value}`;
    }

    const inclusiveStart = filter.operator === ">=" ? "[" : "{";
    const inclusiveEnd = filter.operator === "<=" ? "]" : "}";

    if (filter.operator === ">" || filter.operator === ">=") {
      return `${fieldPath}:${inclusiveStart}${filter.value} TO *]`;
    }

    return `${fieldPath}:[* TO ${filter.value}${inclusiveEnd}`;
  }

  if (filter.type === "datetime") {
    const formattedValue = filter.value.toISOString();

    if (filter.operator === ">=" || filter.operator === ">") {
      return `${fieldPath}:${filter.operator === ">=" ? "[" : "{"}${formattedValue} TO *]`;
    }

    return `${fieldPath}:[* TO ${formattedValue}${filter.operator === "<=" ? "]" : "}"}`;
  }

  return undefined;
}

function isEventsLuceneSerializableFilterCondition(filter: FilterCondition) {
  return Boolean(serializeEventsLuceneFilterCondition(filter));
}

function createTextFilterCondition(
  field: EventsLuceneFieldRef,
  operator: "contains" | "does not contain" | "starts with" | "ends with",
  value: string,
): FilterCondition {
  if (field.type === "metadata") {
    return {
      type: "stringObject",
      column: "metadata",
      key: field.key,
      operator,
      value,
    };
  }

  return {
    type: "string",
    column: field.id,
    operator,
    value,
  };
}

function createExactOptionFilterCondition(
  field: Extract<EventsLuceneFieldRef, { type: "field" }>,
  operator: "any of" | "none of",
  value: string,
): FilterCondition {
  if (getFieldSyncMode(field) === "arrayOption") {
    return {
      type: "arrayOptions",
      column: field.id,
      operator,
      value: [value],
    };
  }

  return {
    type: "stringOptions",
    column: field.id,
    operator,
    value: [value],
  };
}

function createBooleanFilterCondition(
  field: Extract<EventsLuceneFieldRef, { type: "field" }>,
  negated: boolean,
  rawValue: string,
): FilterCondition {
  const normalizedValue = rawValue.trim().toLowerCase();

  if (normalizedValue !== "true" && normalizedValue !== "false") {
    throw getUnsupportedLuceneFilterError(
      `Field "${field.id}" expects a boolean value (true or false) in events search filters.`,
    );
  }

  const booleanValue = normalizedValue === "true";

  return {
    type: "boolean",
    column: field.id,
    operator: negated ? "<>" : "=",
    value: booleanValue,
  };
}

function translateLuceneTextOperator(params: {
  value: string;
  wildcard: boolean;
  negated: boolean;
  field: EventsLuceneFieldRef;
}): {
  operator: "contains" | "does not contain" | "starts with" | "ends with";
  value: string;
} {
  const { value, wildcard, negated, field } = params;

  if (!wildcard) {
    return {
      operator: negated ? "does not contain" : "contains",
      value,
    };
  }

  if (value.includes("?")) {
    throw getUnsupportedLuceneFilterError(
      `Single-character wildcards are not supported for "${getFieldLabel(field)}" in events search filters.`,
    );
  }

  const hasLeadingWildcard = value.startsWith("*");
  const hasTrailingWildcard = value.endsWith("*");
  const normalizedValue = value.slice(
    hasLeadingWildcard ? 1 : 0,
    hasTrailingWildcard ? -1 : value.length,
  );

  if (!normalizedValue || normalizedValue.includes("*")) {
    throw getUnsupportedLuceneFilterError(
      `Only prefix or suffix wildcards are supported for "${getFieldLabel(field)}" in events search filters.`,
    );
  }

  if (hasLeadingWildcard && hasTrailingWildcard) {
    return {
      operator: negated ? "does not contain" : "contains",
      value: normalizedValue,
    };
  }

  if (negated) {
    throw getUnsupportedLuceneFilterError(
      `Negated prefix or suffix wildcards are not supported for "${getFieldLabel(field)}" in events search filters.`,
    );
  }

  if (hasTrailingWildcard) {
    return {
      operator: "starts with",
      value: normalizedValue,
    };
  }

  if (hasLeadingWildcard) {
    return {
      operator: "ends with",
      value: normalizedValue,
    };
  }

  throw getUnsupportedLuceneFilterError(
    `Unsupported wildcard pattern for "${getFieldLabel(field)}" in events search filters.`,
  );
}

function createNullFilterCondition(
  column: string,
  operator: "is null" | "is not null",
): FilterCondition {
  return {
    type: "null",
    column,
    operator,
    value: "",
  };
}

function createNumericEqualityFilter(
  column: string,
  rawValue: string,
): FilterCondition {
  const parsedValue = Number(rawValue);

  if (Number.isNaN(parsedValue)) {
    throw getUnsupportedLuceneFilterError(
      `Field "${column}" expects a numeric value in events search filters.`,
    );
  }

  return {
    type: "number",
    column,
    operator: "=",
    value: parsedValue,
  };
}

function invertNumericEqualityFilter(
  column: string,
  rawValue: string,
): FilterExpression {
  const parsedValue = Number(rawValue);

  if (Number.isNaN(parsedValue)) {
    throw getUnsupportedLuceneFilterError(
      `Field "${column}" expects a numeric value in events search filters.`,
    );
  }

  return collapseFilterGroup("OR", [
    {
      type: "number",
      column,
      operator: "<",
      value: parsedValue,
    },
    {
      type: "number",
      column,
      operator: ">",
      value: parsedValue,
    },
  ]);
}

function createRangeBoundFilter(
  column: EventsLuceneFieldId,
  kind: EventsLuceneFieldKind,
  operator: ">" | "<" | ">=" | "<=",
  rawValue: string,
): FilterCondition {
  if (kind === "number") {
    const parsedValue = Number(rawValue);

    if (Number.isNaN(parsedValue)) {
      throw getUnsupportedLuceneFilterError(
        `Field "${column}" expects a numeric value in events search filters.`,
      );
    }

    return {
      type: "number",
      column,
      operator,
      value: parsedValue,
    };
  }

  const parsedValue = new Date(rawValue);

  if (Number.isNaN(parsedValue.getTime())) {
    throw getUnsupportedLuceneFilterError(
      `Field "${column}" expects an ISO datetime value in events search filters.`,
    );
  }

  return {
    type: "datetime",
    column,
    operator,
    value: parsedValue,
  };
}

function convertRangeExpressionToFilter(
  expression: Extract<EventsLuceneExpression, { type: "range" }>,
  negated: boolean,
): FilterExpression {
  if (expression.field.type !== "field") {
    throw getUnsupportedLuceneFilterError(
      "Metadata range queries are not supported in events search filters.",
    );
  }

  const fieldKind = getEventsLuceneFieldKindById(expression.field.id);
  const conditions: FilterExpression[] = [];

  if (!negated) {
    if (expression.min !== null) {
      conditions.push(
        createRangeBoundFilter(
          expression.field.id,
          fieldKind,
          expression.inclusiveMin ? ">=" : ">",
          expression.min,
        ),
      );
    }

    if (expression.max !== null) {
      conditions.push(
        createRangeBoundFilter(
          expression.field.id,
          fieldKind,
          expression.inclusiveMax ? "<=" : "<",
          expression.max,
        ),
      );
    }

    return collapseFilterGroup("AND", conditions);
  }

  if (expression.min !== null) {
    conditions.push(
      createRangeBoundFilter(
        expression.field.id,
        fieldKind,
        expression.inclusiveMin ? "<" : "<=",
        expression.min,
      ),
    );
  }

  if (expression.max !== null) {
    conditions.push(
      createRangeBoundFilter(
        expression.field.id,
        fieldKind,
        expression.inclusiveMax ? ">" : ">=",
        expression.max,
      ),
    );
  }

  return collapseFilterGroup("OR", conditions);
}

function convertTextExpressionToFilter(
  expression: Extract<EventsLuceneExpression, { type: "text" }>,
  negated: boolean,
): FilterExpression {
  if (!expression.field) {
    throw getUnsupportedLuceneFilterError(
      "Lucene filters with operators must use explicit fields in the events search bar.",
    );
  }

  const fieldLabel = getFieldLabel(expression.field);
  const fieldKind = getFieldKind(expression.field);

  if (expression.exists) {
    if (expression.field.type === "metadata") {
      throw getUnsupportedLuceneFilterError(
        `Metadata existence queries are not supported for "${fieldLabel}" in events search filters.`,
      );
    }

    if (fieldKind === "text") {
      throw getUnsupportedLuceneFilterError(
        `Existence queries are only supported on numeric or datetime event fields. "${fieldLabel}" is a text field.`,
      );
    }

    return createNullFilterCondition(
      expression.field.id,
      negated ? "is null" : "is not null",
    );
  }

  if (fieldKind === "number") {
    return negated
      ? invertNumericEqualityFilter(fieldLabel, expression.value)
      : createNumericEqualityFilter(fieldLabel, expression.value);
  }

  if (fieldKind === "boolean") {
    if (expression.field.type !== "field") {
      throw getUnsupportedLuceneFilterError(
        `Field "${fieldLabel}" expects a boolean value in events search filters.`,
      );
    }

    return createBooleanFilterCondition(
      expression.field,
      negated,
      expression.value,
    );
  }

  if (fieldKind === "datetime") {
    throw getUnsupportedLuceneFilterError(
      `Field "${fieldLabel}" only supports range queries in events search filters.`,
    );
  }

  if (
    expression.field.type === "field" &&
    !expression.wildcard &&
    getFieldSyncMode(expression.field) !== "textSearch"
  ) {
    return createExactOptionFilterCondition(
      expression.field,
      negated ? "none of" : "any of",
      expression.value,
    );
  }

  const translatedTextOperator = translateLuceneTextOperator({
    value: expression.value,
    wildcard: expression.wildcard,
    negated,
    field: expression.field,
  });

  return createTextFilterCondition(
    expression.field,
    translatedTextOperator.operator,
    translatedTextOperator.value,
  );
}

function convertFieldedLuceneExpressionToFilter(
  expression: EventsLuceneExpression,
): FilterExpression {
  if (expression.type === "group") {
    return collapseFilterGroup(
      expression.operator,
      expression.conditions.map((condition) =>
        convertFieldedLuceneExpressionToFilter(condition),
      ),
    );
  }

  if (expression.type === "not") {
    return convertNegatedLuceneExpressionToFilter(expression.condition);
  }

  if (expression.type === "range") {
    return convertRangeExpressionToFilter(expression, false);
  }

  return convertTextExpressionToFilter(expression, false);
}

function convertNegatedLuceneExpressionToFilter(
  expression: EventsLuceneExpression,
): FilterExpression {
  if (expression.type === "group") {
    return collapseFilterGroup(
      expression.operator === "AND" ? "OR" : "AND",
      expression.conditions.map((condition) =>
        convertNegatedLuceneExpressionToFilter(condition),
      ),
    );
  }

  if (expression.type === "not") {
    return convertFieldedLuceneExpressionToFilter(expression.condition);
  }

  if (expression.type === "range") {
    return convertRangeExpressionToFilter(expression, true);
  }

  return convertTextExpressionToFilter(expression, true);
}

export function parseEventsLuceneQuery(
  query: string | null | undefined,
): EventsLuceneExpression | undefined {
  const trimmedQuery = query?.trim();

  if (!trimmedQuery) {
    return undefined;
  }

  try {
    const rawAst = luceneParser.parse(trimmedQuery);
    return normalizeRawLuceneNode(rawAst);
  } catch (error) {
    if (error instanceof InvalidRequestError) {
      throw error;
    }

    if (error instanceof Error) {
      throw getInvalidLuceneQueryError(error.message);
    }

    throw getInvalidLuceneQueryError("Failed to parse query.");
  }
}

export function validateEventsLuceneQuery(
  query: string | null | undefined,
): EventsLuceneValidationResult {
  try {
    return {
      isValid: true,
      expression: parseEventsLuceneQuery(query),
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Invalid Lucene query.";

    return {
      isValid: false,
      error: message,
    };
  }
}

export function resolveEventsLuceneQueryForApi(
  query: string | null | undefined,
): EventsLuceneApiQueryResult {
  const trimmedQuery = query?.trim();

  if (!trimmedQuery) {
    return { isValid: true };
  }

  if (isSimpleFreeTextQuery(trimmedQuery)) {
    return {
      isValid: true,
      searchQuery: trimmedQuery,
      searchType: EVENTS_LUCENE_SEARCH_TYPE,
    };
  }

  try {
    const expression = parseEventsLuceneQuery(trimmedQuery);

    if (!expression) {
      return { isValid: true };
    }

    if (!containsExplicitField(expression)) {
      if (
        expression.type === "text" &&
        expression.field === null &&
        !expression.wildcard &&
        !expression.exists
      ) {
        return {
          isValid: true,
          expression,
          searchQuery: expression.value,
          searchType: EVENTS_LUCENE_SEARCH_TYPE,
        };
      }

      throw getUnsupportedLuceneFilterError(
        "Lucene operators require explicit field names in the events search bar. Use plain free text for broad search, or fielded clauses like name:weather AND level:ERROR.",
      );
    }

    if (containsBareTextClause(expression)) {
      throw getUnsupportedLuceneFilterError(
        "When you use Lucene filters in the events search bar, every clause must specify a field. Use plain free text alone, or add fields like name:weather OR traceId:trace-123.",
      );
    }

    return {
      isValid: true,
      expression,
      filter: convertFieldedLuceneExpressionToFilter(expression),
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Invalid Lucene query.",
    };
  }
}
