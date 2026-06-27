import { InvalidRequestError } from "../../../errors";
import {
  eventsTableCols,
  eventsTableHasParentObservationSql,
  eventsTableIsRootObservationSql,
} from "../../../eventsTable";
import type { FilterState } from "../../../types";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import { FilterList } from "./clickhouse-filter";
import {
  EventsAggQueryBuilder,
  EventsQueryBuilder,
} from "./event-query-builder";
import { createFilterFromFilterState } from "./factory";

export const EVENTS_FILTER_OPTION_TOP_N = 1000;
const EVENTS_FILTER_OPTION_TOP_K_MAX_N = 65_536;

type EventFilterOptionSort = "countDesc" | "alpha" | "booleanAsc";

type EventFilterOptionDefinition =
  | {
      kind: "scalar";
      expression: string;
      includeWhen: string;
      sort: EventFilterOptionSort;
    }
  | {
      kind: "array";
      expression: string;
      sort: EventFilterOptionSort;
      distinct?: boolean;
    }
  | {
      kind: "boolean";
      expression: string;
      sort: "booleanAsc";
    };

const EVENTS_FILTER_OPTION_DEFINITIONS = {
  providedModelName: {
    kind: "scalar",
    expression: "e.provided_model_name",
    includeWhen:
      "e.provided_model_name IS NOT NULL AND length(e.provided_model_name) > 0",
    sort: "countDesc",
  },
  modelId: {
    kind: "scalar",
    expression: "e.model_id",
    includeWhen: "e.model_id IS NOT NULL AND length(e.model_id) > 0",
    sort: "countDesc",
  },
  name: {
    kind: "scalar",
    expression: "e.name",
    includeWhen: "e.name IS NOT NULL AND length(e.name) > 0",
    sort: "countDesc",
  },
  traceName: {
    kind: "scalar",
    expression: "e.trace_name",
    includeWhen: "e.trace_name IS NOT NULL AND length(e.trace_name) > 0",
    sort: "countDesc",
  },
  type: {
    kind: "scalar",
    expression: "e.type",
    includeWhen: "e.type IS NOT NULL AND length(e.type) > 0",
    sort: "countDesc",
  },
  userId: {
    kind: "scalar",
    expression: "e.user_id",
    includeWhen: "e.user_id IS NOT NULL AND length(e.user_id) > 0",
    sort: "countDesc",
  },
  version: {
    kind: "scalar",
    expression: "e.version",
    includeWhen: "e.version IS NOT NULL AND length(e.version) > 0",
    sort: "countDesc",
  },
  sessionId: {
    kind: "scalar",
    expression: "e.session_id",
    includeWhen: "e.session_id IS NOT NULL AND length(e.session_id) > 0",
    sort: "countDesc",
  },
  level: {
    kind: "scalar",
    expression: "e.level",
    includeWhen: "e.level IS NOT NULL AND length(e.level) > 0",
    sort: "countDesc",
  },
  environment: {
    kind: "scalar",
    expression: "e.environment",
    includeWhen: "e.environment IS NOT NULL AND length(e.environment) > 0",
    sort: "countDesc",
  },
  promptName: {
    kind: "scalar",
    expression: "e.prompt_name",
    includeWhen:
      "e.type = 'GENERATION' AND e.prompt_name IS NOT NULL AND e.prompt_name != ''",
    sort: "countDesc",
  },
  traceTags: {
    kind: "array",
    expression: "e.tags",
    sort: "alpha",
    distinct: true,
  },
  experimentDatasetId: {
    kind: "scalar",
    expression: "e.experiment_dataset_id",
    includeWhen:
      "e.experiment_dataset_id IS NOT NULL AND length(e.experiment_dataset_id) > 0",
    sort: "countDesc",
  },
  experimentId: {
    kind: "scalar",
    expression: "e.experiment_id",
    includeWhen: "e.experiment_id IS NOT NULL AND length(e.experiment_id) > 0",
    sort: "countDesc",
  },
  experimentName: {
    kind: "scalar",
    expression: "e.experiment_name",
    includeWhen:
      "e.experiment_name IS NOT NULL AND length(e.experiment_name) > 0",
    sort: "countDesc",
  },
  isRootObservation: {
    kind: "boolean",
    expression: eventsTableIsRootObservationSql,
    sort: "booleanAsc",
  },
  hasParentObservation: {
    kind: "boolean",
    expression: eventsTableHasParentObservationSql,
    sort: "booleanAsc",
  },
  toolNames: {
    kind: "array",
    expression: "mapKeys(e.tool_definitions)",
    sort: "countDesc",
  },
  calledToolNames: {
    kind: "array",
    expression: "e.tool_call_names",
    sort: "countDesc",
  },
} satisfies Record<string, EventFilterOptionDefinition>;

export type EventFilterOptionColumn =
  keyof typeof EVENTS_FILTER_OPTION_DEFINITIONS;

export type EventFilterOptionRow = {
  column: EventFilterOptionColumn;
  value: string;
  count: number;
};

export type EventFilterOptionScope = "scoredTraces";

const EVENTS_FILTER_OPTION_COLUMN_IDENTIFIER_PATTERN = /^[A-Za-z]+$/;

const assertEventFilterOptionColumnSet = <T extends Record<string, unknown>>(
  definitions: T,
): ReadonlySet<Extract<keyof T, string>> => {
  const columns = Object.keys(definitions) as Array<Extract<keyof T, string>>;
  const invalidColumn = columns.find(
    (column) => !EVENTS_FILTER_OPTION_COLUMN_IDENTIFIER_PATTERN.test(column),
  );

  if (invalidColumn) {
    throw new Error(
      `Invalid events filter option column identifier: ${invalidColumn}`,
    );
  }

  return new Set(columns);
};

const EVENTS_FILTER_OPTION_COLUMN_SET = assertEventFilterOptionColumnSet(
  EVENTS_FILTER_OPTION_DEFINITIONS,
);

const isEventFilterOptionColumn = (
  column: unknown,
): column is EventFilterOptionColumn =>
  typeof column === "string" &&
  EVENTS_FILTER_OPTION_COLUMN_SET.has(column as EventFilterOptionColumn);

export const normalizeEventFilterOptionColumn = (
  column: unknown,
): EventFilterOptionColumn => {
  if (!isEventFilterOptionColumn(column)) {
    throw new InvalidRequestError(
      `Unsupported events filter option column: ${String(column)}`,
    );
  }

  return column;
};

const uniqueEventFilterOptionColumns = (
  columns: readonly EventFilterOptionColumn[],
) => Array.from(new Set(columns.map(normalizeEventFilterOptionColumn)));

const eventFilterOptionColumnSqlLiteral = (column: EventFilterOptionColumn) =>
  `'${column}'`;

const stringValueExpression = (expression: string) =>
  `toString(ifNull(${expression}, ''))`;

const optionValuesArrayExpression = (
  column: EventFilterOptionColumn,
): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return `if(${definition.includeWhen}, [${stringValueExpression(definition.expression)}], CAST([], 'Array(String)'))`;
  }

  if (definition.kind === "boolean") {
    return `[if(${definition.expression}, 'true', 'false')]`;
  }

  const valuesExpression =
    "distinct" in definition && definition.distinct
      ? `arrayDistinct(${definition.expression})`
      : definition.expression;

  return `arrayMap(value -> toString(value), arrayFilter(value -> length(toString(value)) > 0, ${valuesExpression}))`;
};

const optionPresenceCondition = (column: EventFilterOptionColumn): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return definition.includeWhen;
  }

  if (definition.kind === "boolean") {
    return "1";
  }

  return `length(${definition.expression}) > 0`;
};

const singleColumnOrderBy = (column: EventFilterOptionColumn): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.sort === "countDesc") {
    return "ORDER BY count() DESC, value ASC";
  }

  return "ORDER BY value ASC";
};

const optionTopAlias = (column: EventFilterOptionColumn) =>
  `${column}TopOptions`;

const optionTopKSelectExpression = (column: EventFilterOptionColumn) => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar") {
    return `approx_top_kIf({optionLimit: UInt64})(${stringValueExpression(definition.expression)}, ${definition.includeWhen}) AS ${optionTopAlias(column)}`;
  }

  if (definition.kind === "boolean") {
    return `arrayFilter(option -> tupleElement(option, 2) > 0, [tuple('false', countIf(NOT (${definition.expression})), toUInt64(0)), tuple('true', countIf(${definition.expression}), toUInt64(0))]) AS ${optionTopAlias(column)}`;
  }

  return `approx_top_kArray({optionLimit: UInt64})(${optionValuesArrayExpression(column)}) AS ${optionTopAlias(column)}`;
};

const optionRowsArrayExpression = (column: EventFilterOptionColumn) => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const topAlias = optionTopAlias(column);
  // Alpha facets use a constant sort key; the final ORDER BY value tie-breaker
  // below provides alphabetical ordering within the top-k candidate set.
  const sortKeyExpression =
    definition.sort === "countDesc"
      ? "-toInt64(tupleElement(option, 2))"
      : definition.sort === "booleanAsc"
        ? "if(tupleElement(option, 1) = 'true', toInt64(1), toInt64(0))"
        : "toInt64(0)";

  return `arrayMap(option -> tuple(${eventFilterOptionColumnSqlLiteral(column)}, tupleElement(option, 1), tupleElement(option, 2), ${sortKeyExpression}), ${topAlias})`;
};

const eventFilterOptionScopeCondition = (
  scope: EventFilterOptionScope,
): string => {
  switch (scope) {
    case "scoredTraces":
      return "e.trace_id IN (SELECT DISTINCT trace_id FROM scores WHERE project_id = {projectId: String})";
  }
};

export const buildEventsFilterOptionColumnQuery = (params: {
  projectId: string;
  filter: FilterState;
  column: EventFilterOptionColumn;
  limit: number;
  offset?: number;
  scope?: EventFilterOptionScope;
}): { query: string; params: Record<string, unknown> } | null => {
  if (params.limit <= 0) {
    return null;
  }

  const column = normalizeEventFilterOptionColumn(params.column);
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      params.filter,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const valueExpression =
    definition.kind === "scalar"
      ? `toString(${definition.expression})`
      : definition.kind === "boolean"
        ? `if(${definition.expression}, 'true', 'false')`
        : `arrayJoin(${optionValuesArrayExpression(column)})`;

  const queryBuilder = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "value",
    selectExpression: `${eventFilterOptionColumnSqlLiteral(column)} AS column, ${valueExpression} AS value, count() AS count`,
  })
    .where(eventsFilter.apply())
    .whereRaw(optionPresenceCondition(column))
    .orderBy(singleColumnOrderBy(column))
    .limit(params.limit, params.offset ?? 0);

  if (params.scope) {
    queryBuilder.whereRaw(eventFilterOptionScopeCondition(params.scope));
  }

  return queryBuilder.buildWithParams();
};

export const buildEventsFilterOptionsForColumnsQuery = (params: {
  projectId: string;
  filter: FilterState;
  columns: readonly EventFilterOptionColumn[];
  limit: number;
  scope?: EventFilterOptionScope;
}): { query: string; params: Record<string, unknown> } | null => {
  const columns = uniqueEventFilterOptionColumns(params.columns);
  if (columns.length === 0 || params.limit <= 0) {
    return null;
  }

  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      params.filter,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const optionLimit = Math.min(params.limit, EVENTS_FILTER_OPTION_TOP_K_MAX_N);
  const aggregatedOptionsBuilder = new EventsQueryBuilder({
    projectId: params.projectId,
  })
    .selectRaw(...columns.map(optionTopKSelectExpression))
    .where(eventsFilter.apply());

  if (params.scope) {
    aggregatedOptionsBuilder.whereRaw(
      eventFilterOptionScopeCondition(params.scope),
    );
  }

  const { query: aggregatedOptionsQuery, params: aggregatedOptionsParams } =
    aggregatedOptionsBuilder.buildWithParams();

  const query = `
WITH aggregated_options AS (
${aggregatedOptionsQuery}
),
option_rows AS (
  SELECT
    arrayJoin(arrayConcat(
      ${columns.map(optionRowsArrayExpression).join(",\n      ")}
    )) AS option
  FROM aggregated_options
)
SELECT
  tupleElement(option, 1) AS column,
  tupleElement(option, 2) AS value,
  tupleElement(option, 3) AS count
FROM option_rows
ORDER BY column ASC, tupleElement(option, 4) ASC, tupleElement(option, 2) ASC
`.trim();

  return {
    query,
    params: {
      ...aggregatedOptionsParams,
      optionLimit,
    },
  };
};
