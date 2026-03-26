import luceneParser, {
  type LuceneBinaryNode,
  type LuceneNode,
  type LuceneRangeNode,
} from "./hyperdx-lucene";
import { InvalidRequestError } from "../../errors";
import type { TracingSearchType } from "../../interfaces/search";
import type { FilterCondition, FilterExpression } from "../../types";

export type EventsLuceneFieldKind = "text" | "number" | "datetime";

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
  description: string;
};

const EVENTS_LUCENE_FIELDS: EventsLuceneFieldDefinition[] = [
  {
    id: "id",
    aliases: ["id", "spanid", "span_id", "observationid", "observation_id"],
    kind: "text",
    bareSearchable: true,
    description: "Observation/span identifier",
  },
  {
    id: "traceId",
    aliases: ["traceid", "trace_id"],
    kind: "text",
    bareSearchable: true,
    description: "Trace identifier",
  },
  {
    id: "name",
    aliases: ["name"],
    kind: "text",
    bareSearchable: true,
    description: "Observation name",
  },
  {
    id: "traceName",
    aliases: ["tracename", "trace_name"],
    kind: "text",
    bareSearchable: true,
    description: "Trace name",
  },
  {
    id: "type",
    aliases: ["type"],
    kind: "text",
    bareSearchable: true,
    description: "Observation type",
  },
  {
    id: "environment",
    aliases: ["environment", "env"],
    kind: "text",
    bareSearchable: true,
    description: "Environment",
  },
  {
    id: "userId",
    aliases: ["userid", "user_id"],
    kind: "text",
    bareSearchable: true,
    description: "Trace user id",
  },
  {
    id: "sessionId",
    aliases: ["sessionid", "session_id"],
    kind: "text",
    bareSearchable: true,
    description: "Trace session id",
  },
  {
    id: "level",
    aliases: ["level"],
    kind: "text",
    bareSearchable: true,
    description: "Observation level",
  },
  {
    id: "statusMessage",
    aliases: ["statusmessage", "status_message", "status"],
    kind: "text",
    bareSearchable: true,
    description: "Status message",
  },
  {
    id: "modelId",
    aliases: ["modelid", "model_id"],
    kind: "text",
    bareSearchable: true,
    description: "Internal model id",
  },
  {
    id: "providedModelName",
    aliases: ["providedmodelname", "provided_model_name", "model"],
    kind: "text",
    bareSearchable: true,
    description: "Provided model name",
  },
  {
    id: "promptName",
    aliases: ["promptname", "prompt_name"],
    kind: "text",
    bareSearchable: true,
    description: "Prompt name",
  },
  {
    id: "promptVersion",
    aliases: ["promptversion", "prompt_version"],
    kind: "number",
    bareSearchable: false,
    description: "Prompt version",
  },
  {
    id: "startTime",
    aliases: ["starttime", "start_time"],
    kind: "datetime",
    bareSearchable: false,
    description: "Observation start time",
  },
  {
    id: "endTime",
    aliases: ["endtime", "end_time"],
    kind: "datetime",
    bareSearchable: false,
    description: "Observation end time",
  },
  {
    id: "input",
    aliases: ["input"],
    kind: "text",
    bareSearchable: false,
    description: "Observation input",
  },
  {
    id: "output",
    aliases: ["output"],
    kind: "text",
    bareSearchable: false,
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
    if (node.quoted) {
      throw getInvalidLuceneQueryError(
        `Field "${field.type === "field" ? field.id : `metadata.${field.key}`}" does not support quoted values in the Lucene bar.`,
      );
    }

    // Numeric equality is allowed for unquoted exact values only.
    if (getFieldKind(field) !== "number") {
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
  return EVENTS_LUCENE_FIELDS.find((field) => field.id === fieldId)!.kind;
}

export const EVENTS_LUCENE_QUERY_EXAMPLES = [
  'name:"chat completion" AND level:error',
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

function getUnsupportedLuceneFilterError(message: string): InvalidRequestError {
  return getInvalidLuceneQueryError(message);
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

  if (fieldKind === "datetime") {
    throw getUnsupportedLuceneFilterError(
      `Field "${fieldLabel}" only supports range queries in events search filters.`,
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
