/* eslint-disable no-nested-ternary */
import { InvalidRequestError } from "../../../errors";
import { UNKNOWN_INGESTION_SDK_VALUE } from "../../ingestion/ingestionAttribution";
import {
  eventsTableCols,
  eventsTableHasParentObservationSql,
  eventsTableIsRootObservationSql,
  eventsTableTraceNameSql,
} from "../../../eventsTable";
import type { FilterState } from "../../../types";
import { convertDateToClickhouseDateTime } from "../../clickhouse/client";
import { eventsTableUiColumnDefinitions } from "../../tableMappings/mapEventsTable";
import { FilterList } from "./clickhouse-filter";
import { EventsAggQueryBuilder } from "./event-query-builder";
import { buildEventsObservationRowSelection } from "./events-observation-row-selection";
import { createFilterFromFilterState } from "./factory";

export const EVENTS_FILTER_OPTION_TOP_N = 1000;

// Sentinel "column" carrying the approx total observation count in the facet result.
export const EVENTS_APPROX_TOTAL_COUNT_MARKER = "__approxTotalCount__";

// Named row tuple emitted per facet option. Casting to a named Tuple lets the
// final projection read option.column / option.sortKey etc. instead of opaque
// positional tupleElement(option, N) reads, and forces every facet — plus the
// approx-total sentinel below — to arrayConcat with a structurally identical
// shape (arrayConcat rejects mismatched element types).
const EVENTS_FILTER_OPTION_ROW_TUPLE_TYPE =
  "Tuple(column String, value String, count UInt64, sortKey Int64, displayValue String)";

const castEventFilterOptionRowTuple = (tupleExpression: string): string =>
  `CAST(${tupleExpression} AS ${EVENTS_FILTER_OPTION_ROW_TUPLE_TYPE})`;

const EVENTS_APPROX_TOTAL_COUNT_TUPLE = castEventFilterOptionRowTuple(
  `tuple('${EVENTS_APPROX_TOTAL_COUNT_MARKER}', '', toUInt64(approx_total_count), toInt64(0), '')`,
);

const EVENTS_FILTER_OPTION_TOP_K_MAX_N = 65_536;

/** EVENTS_FILTER_OPTION_SAMPLE_ROWS caps the events read behind the UI filter option queries. */
export const EVENTS_FILTER_OPTION_SAMPLE_ROWS = 6_000_000;

// MergeTree virtual column = 1/fraction, exactly 1.0 when unsampled.
const EVENTS_SAMPLE_FACTOR_SELECT = "any(e._sample_factor) AS sample_factor";

/** eventFilterOptionCountExpression scales a grouped event count back to full-table scale. */
const eventFilterOptionCountExpression = (sampleRows: number) =>
  sampleRows > 0
    ? "toUInt64(round(count() * any(e._sample_factor)))"
    : "count()";

type EventFilterOptionSort = "countDesc" | "alpha" | "booleanAsc";

type EventFilterOptionDefinition =
  | {
      kind: "scalar";
      expression: string;
      includeWhen: string;
      sort: EventFilterOptionSort;
    }
  | {
      kind: "labeledScalar";
      expression: string;
      labelExpression: string;
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
    expression: eventsTableTraceNameSql,
    includeWhen: `${eventsTableTraceNameSql} IS NOT NULL`,
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
  release: {
    kind: "scalar",
    expression: "e.release",
    includeWhen: "e.release IS NOT NULL AND length(e.release) > 0",
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
  ingestionApiKey: {
    kind: "scalar",
    expression: "e.ingestion_api_key",
    includeWhen: "length(e.ingestion_api_key) > 0",
    sort: "countDesc",
  },
  // The SDK attribution columns default to the 'unknown' placeholder (see
  // clickhouse migration 0042 / UNKNOWN_INGESTION_SDK_VALUE), not '' like
  // ingestion_api_key — exclude it so the facet only offers real SDK values.
  ingestionSdkName: {
    kind: "scalar",
    expression: "e.ingestion_sdk_name",
    includeWhen: `length(e.ingestion_sdk_name) > 0 AND e.ingestion_sdk_name != '${UNKNOWN_INGESTION_SDK_VALUE}'`,
    sort: "countDesc",
  },
  ingestionSdkVersion: {
    kind: "scalar",
    expression: "e.ingestion_sdk_version",
    includeWhen: `length(e.ingestion_sdk_version) > 0 AND e.ingestion_sdk_version != '${UNKNOWN_INGESTION_SDK_VALUE}'`,
    sort: "countDesc",
  },
  ingestionSource: {
    kind: "scalar",
    expression: "e.source",
    includeWhen: "length(e.source) > 0",
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
    kind: "labeledScalar",
    expression: "e.experiment_id",
    labelExpression: "e.experiment_name",
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
  metadataKeys: {
    kind: "array",
    expression: "e.metadata_names",
    sort: "countDesc",
    distinct: true,
  },
} satisfies Record<string, EventFilterOptionDefinition>;

export type EventFilterOptionColumn =
  keyof typeof EVENTS_FILTER_OPTION_DEFINITIONS;

export type EventFilterOptionRow = {
  column: EventFilterOptionColumn;
  value: string;
  count: number;
  displayValue?: string;
};

// scoredTraces restricts events to traces that carry a score. The optional
// time bounds mirror the scores list view's both-sided window on
// scores.timestamp, so offered options match what the windowed view can
// actually display (and the subquery prunes by partition/PK instead of
// scanning all history).
export type EventFilterOptionScope = {
  type: "scoredTraces";
  fromTime?: { operator: ">=" | ">"; value: Date };
  toTime?: { operator: "<=" | "<"; value: Date };
};

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

// Shared by the sumMap keys and the parallel "ones" counts array so both derive
// their length from one filter and cannot drift apart.
const optionValuesFilteredExpression = (
  definition: Extract<EventFilterOptionDefinition, { kind: "array" }>,
): string => {
  const valuesExpression = definition.distinct
    ? `arrayDistinct(${definition.expression})`
    : definition.expression;

  return `arrayFilter(value -> length(toString(value)) > 0, ${valuesExpression})`;
};

const optionValuesArrayExpression = (
  definition: Extract<EventFilterOptionDefinition, { kind: "array" }>,
): string =>
  `arrayMap(value -> toString(value), ${optionValuesFilteredExpression(definition)})`;

const optionPresenceCondition = (column: EventFilterOptionColumn): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];

  if (definition.kind === "scalar" || definition.kind === "labeledScalar") {
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

  if (definition.kind === "labeledScalar") {
    return `approx_top_kIf({optionLimit: UInt64})(tuple(${stringValueExpression(definition.expression)}, ${stringValueExpression(definition.labelExpression)}), ${definition.includeWhen}) AS ${optionTopAlias(column)}`;
  }

  if (definition.kind === "boolean") {
    return `arrayFilter(option -> tupleElement(option, 2) > 0, [tuple('false', countIf(NOT (${definition.expression})), toUInt64(0)), tuple('true', countIf(${definition.expression}), toUInt64(0))]) AS ${optionTopAlias(column)}`;
  }

  return `approx_top_kArray({optionLimit: UInt64})(${optionValuesArrayExpression(definition)}) AS ${optionTopAlias(column)}`;
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
  // labeledScalar top-k entries nest (value, label) in element 1; scalar/array/
  // boolean entries put the value directly in element 1 and carry no label.
  const isLabeled = definition.kind === "labeledScalar";
  const valueExpression = isLabeled
    ? "tupleElement(tupleElement(option, 1), 1)"
    : "tupleElement(option, 1)";
  const displayValueExpression = isLabeled
    ? "tupleElement(tupleElement(option, 1), 2)"
    : "''";

  return `arrayMap(option -> ${castEventFilterOptionRowTuple(
    `tuple(${eventFilterOptionColumnSqlLiteral(column)}, ${valueExpression}, tupleElement(option, 2), ${sortKeyExpression}, ${displayValueExpression})`,
  )}, ${topAlias})`;
};

const eventFilterOptionScopeCondition = (
  scope: EventFilterOptionScope,
): { condition: string; params: Record<string, unknown> } => {
  switch (scope.type) {
    case "scoredTraces": {
      const clauses = ["project_id = {projectId: String}"];
      const params: Record<string, unknown> = {};
      if (scope.fromTime) {
        clauses.push(
          `timestamp ${scope.fromTime.operator} {scoredTracesFromTime: DateTime64(3, 'UTC')}`,
        );
        params.scoredTracesFromTime = convertDateToClickhouseDateTime(
          scope.fromTime.value,
        );
      }
      if (scope.toTime) {
        clauses.push(
          `timestamp ${scope.toTime.operator} {scoredTracesToTime: DateTime64(3, 'UTC')}`,
        );
        params.scoredTracesToTime = convertDateToClickhouseDateTime(
          scope.toTime.value,
        );
      }
      return {
        condition: `e.trace_id IN (SELECT DISTINCT trace_id FROM scores WHERE ${clauses.join(" AND ")})`,
        params,
      };
    }
  }
};

export const buildEventsFilterOptionColumnQuery = (params: {
  projectId: string;
  filter: FilterState;
  column: EventFilterOptionColumn;
  limit: number;
  offset?: number;
  scope?: EventFilterOptionScope;
  sampleRows?: number;
}): { query: string; params: Record<string, unknown> } | null => {
  if (params.limit <= 0) {
    return null;
  }

  const sampleRows = params.sampleRows ?? 0;

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
    definition.kind === "scalar" || definition.kind === "labeledScalar"
      ? `toString(${definition.expression})`
      : definition.kind === "boolean"
        ? `if(${definition.expression}, 'true', 'false')`
        : `arrayJoin(${optionValuesArrayExpression(definition)})`;

  const queryBuilder = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "value",
    selectExpression: `${eventFilterOptionColumnSqlLiteral(column)} AS column, ${valueExpression} AS value, ${eventFilterOptionCountExpression(sampleRows)} AS count`,
  })
    .where(eventsFilter.apply())
    .whereRaw(optionPresenceCondition(column))
    .orderBy(singleColumnOrderBy(column))
    .limit(params.limit, params.offset ?? 0)
    .sampleRows(sampleRows);

  if (params.scope) {
    const scopeCondition = eventFilterOptionScopeCondition(params.scope);
    queryBuilder.whereRaw(scopeCondition.condition, scopeCondition.params);
  }

  return queryBuilder.buildWithParams();
};

export const buildEventsFilterOptionsForColumnsQuery = (params: {
  projectId: string;
  filter: FilterState;
  columns: readonly EventFilterOptionColumn[];
  limit: number;
  scope?: EventFilterOptionScope;
  // approx total = uniq(span_id) over the bulk scan's full-filter WHERE; re-verify if the scan ever drops predicates
  includeApproxCount?: boolean;
  sampleRows?: number;
}): { query: string; params: Record<string, unknown> } | null => {
  const columns = uniqueEventFilterOptionColumns(params.columns);
  if (columns.length === 0 || params.limit <= 0) {
    return null;
  }

  const optionLimit = Math.min(params.limit, EVENTS_FILTER_OPTION_TOP_K_MAX_N);
  const { queryBuilder: aggregatedOptionsBuilder } =
    buildEventsObservationRowSelection({
      projectId: params.projectId,
      filter: params.filter,
    });

  const includeApproxTotal = params.includeApproxCount === true;
  const sampleRows = params.sampleRows ?? 0;
  const sampled = sampleRows > 0;

  aggregatedOptionsBuilder.selectRaw(
    ...columns.map(optionTopKSelectExpression),
    ...(includeApproxTotal ? ["uniq(e.span_id) AS approx_total_count"] : []),
    ...(sampled ? [EVENTS_SAMPLE_FACTOR_SELECT] : []),
  );
  aggregatedOptionsBuilder.sampleRows(sampleRows);

  if (params.scope) {
    const scopeCondition = eventFilterOptionScopeCondition(params.scope);
    aggregatedOptionsBuilder.whereRaw(
      scopeCondition.condition,
      scopeCondition.params,
    );
  }

  const { query: aggregatedOptionsQuery, params: aggregatedOptionsParams } =
    aggregatedOptionsBuilder.buildWithParams();

  // Approx total rides one extra sentinel row so the result shape stays {column, value, count}.
  const approxTotalCountRow = includeApproxTotal
    ? `,\n      [${EVENTS_APPROX_TOTAL_COUNT_TUPLE}]`
    : "";

  // approx_top_k counts live inside the tuple, so scale in the outer projection.
  const sampleFactorRow = sampled ? ",\n    sample_factor" : "";
  const countExpression = sampled
    ? "toUInt64(round(option.count * sample_factor))"
    : "option.count";

  const query = `
WITH aggregated_options AS (
${aggregatedOptionsQuery}
),
option_rows AS (
  SELECT
    arrayJoin(arrayConcat(
      ${columns.map(optionRowsArrayExpression).join(",\n      ")}${approxTotalCountRow}
    )) AS option${sampleFactorRow}
  FROM aggregated_options
)
SELECT
  option.column AS column,
  option.value AS value,
  ${countExpression} AS count,
  option.displayValue AS displayValue
FROM option_rows
ORDER BY column ASC, option.sortKey ASC, option.value ASC
`.trim();

  return {
    query,
    params: {
      ...aggregatedOptionsParams,
      optionLimit,
    },
  };
};

// Per-column exact aggregate state, computed in the single base scan. Every
// kind resolves to the same alias shape — Array((key, count)) ranked and capped
// to the top-N — so the rows builder below can map any facet uniformly.
// Scalars/arrays aggregate an exact value→count Map (sumMap), then zip it into
// (key, count) pairs; booleans build that pair array directly from two countIf
// branches. The full histogram is held in aggregate-function state, so unlike a
// GROUP BY it does not spill to disk — scan cost is bounded by the base scan's
// sampleRows.
//
// countDesc ranks by (count DESC, value ASC): the value tie-breaker must be
// applied before the optionLimit cap so the top-N stays deterministic at the
// boundary, matching the single-column ORDER BY count() DESC, value ASC. Booleans
// carry only two buckets, always under the cap, so they skip the rank/slice.
//
// Non-boolean facets emit the pipeline as three named columns of the one-row
// aggregate — `<column>_hist` (the value→count Map), `<column>_ranked` (zipped
// and sorted), and `<column>TopOptions` (capped) — so the SQL reads as named
// stages and the histogram is written once instead of inlined per tupleElement
// read. The intermediate columns are only consumed by the next stage's alias;
// the rows builder reads `<column>TopOptions`.
const exactOptionAggSelectExpressions = (
  column: EventFilterOptionColumn,
): string[] => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const topAlias = optionTopAlias(column);

  if (definition.kind === "boolean") {
    return [
      `arrayFilter(option -> tupleElement(option, 2) > 0, [tuple('false', countIf(NOT (${definition.expression})), toUInt64(0)), tuple('true', countIf(${definition.expression}), toUInt64(0))]) AS ${topAlias}`,
    ];
  }

  const histAlias = `${column}_hist`;
  const rankedAlias = `${column}_ranked`;

  // The array values expression stays inlined here: it is a per-row (non-
  // aggregate) array, so it cannot be projected as its own CTE column without a
  // GROUP BY. `<column>_hist` is aggregate state and is projectable.
  const histogram =
    definition.kind === "scalar"
      ? `sumMapIf([${stringValueExpression(definition.expression)}], [toUInt64(1)], ${definition.includeWhen})`
      : definition.kind === "labeledScalar"
        ? `sumMapIf([tuple(${stringValueExpression(definition.expression)}, ${stringValueExpression(definition.labelExpression)})], [toUInt64(1)], ${definition.includeWhen})`
        : (() => {
            const filtered = optionValuesFilteredExpression(definition);
            const keys = `arrayMap(value -> toString(value), ${filtered})`;
            const ones = `arrayMap(value -> toUInt64(1), ${filtered})`;
            return `sumMap(${keys}, ${ones})`;
          })();

  const zipped = `arrayZip(tupleElement(${histAlias}, 1), tupleElement(${histAlias}, 2))`;
  const ranked =
    definition.sort === "countDesc"
      ? `arraySort(pair -> tuple(-toInt64(tupleElement(pair, 2)), tupleElement(pair, 1)), ${zipped})`
      : `arraySort(pair -> tupleElement(pair, 1), ${zipped})`;

  return [
    `${histogram} AS ${histAlias}`,
    `${ranked} AS ${rankedAlias}`,
    `arraySlice(${rankedAlias}, 1, {optionLimit: UInt64}) AS ${topAlias}`,
  ];
};

const exactOptionRowsArrayExpression = (
  column: EventFilterOptionColumn,
): string => {
  const definition = EVENTS_FILTER_OPTION_DEFINITIONS[column];
  const alias = optionTopAlias(column);
  const isLabeled = definition.kind === "labeledScalar";

  // alias = array of option tuples, option = (key, count)
  // key = value              (scalar / array / boolean)
  // key = (value, label)     (labeledScalar)
  // Output row is cast to the named EVENTS_FILTER_OPTION_ROW_TUPLE_TYPE.
  const sortKeyExpression =
    definition.sort === "countDesc"
      ? "-toInt64(tupleElement(option, 2))"
      : definition.sort === "booleanAsc"
        ? "if(tupleElement(option, 1) = 'true', toInt64(1), toInt64(0))"
        : "toInt64(0)";
  const valueExpression = isLabeled
    ? "tupleElement(tupleElement(option, 1), 1)"
    : "tupleElement(option, 1)";
  const displayValueExpression = isLabeled
    ? "tupleElement(tupleElement(option, 1), 2)"
    : "''";

  return `arrayMap(option -> ${castEventFilterOptionRowTuple(
    `tuple(${eventFilterOptionColumnSqlLiteral(column)}, ${valueExpression}, tupleElement(option, 2), ${sortKeyExpression}, ${displayValueExpression})`,
  )}, ${alias})`;
};

/**
 * One events_core scan that materializes the given filter-option facets with
 * exact value→count aggregation (sumMap / countIf), then fans the per-column
 * top-N out with arrayJoin. Used where facet values must stay exact
 * (scores-view facets) instead of the approx_top_k multi-column sketch, without
 * re-scanning or re-evaluating the scope semi-join once per facet.
 */
export const buildEventsExactFilterOptionsForColumnsQuery = (params: {
  projectId: string;
  filter: FilterState;
  columns: readonly EventFilterOptionColumn[];
  limit: number;
  scope?: EventFilterOptionScope;
  sampleRows?: number;
}): { query: string; params: Record<string, unknown> } | null => {
  const columns = uniqueEventFilterOptionColumns(params.columns);
  if (columns.length === 0 || params.limit <= 0) {
    return null;
  }

  const optionLimit = Math.min(params.limit, EVENTS_FILTER_OPTION_TOP_K_MAX_N);
  const { queryBuilder: aggregatedOptionsBuilder } =
    buildEventsObservationRowSelection({
      projectId: params.projectId,
      filter: params.filter,
    });

  const sampleRows = params.sampleRows ?? 0;
  const sampled = sampleRows > 0;

  aggregatedOptionsBuilder.selectRaw(
    ...columns.flatMap(exactOptionAggSelectExpressions),
    ...(sampled ? [EVENTS_SAMPLE_FACTOR_SELECT] : []),
  );
  aggregatedOptionsBuilder.sampleRows(sampleRows);

  if (params.scope) {
    const scopeCondition = eventFilterOptionScopeCondition(params.scope);
    aggregatedOptionsBuilder.whereRaw(
      scopeCondition.condition,
      scopeCondition.params,
    );
  }

  const { query: aggregatedOptionsQuery, params: aggregatedOptionsParams } =
    aggregatedOptionsBuilder.buildWithParams();

  const sampleFactorRow = sampled ? ",\n    sample_factor" : "";
  const countExpression = sampled
    ? "toUInt64(round(option.count * sample_factor))"
    : "option.count";

  const query = `
WITH aggregated_options AS (
${aggregatedOptionsQuery}
),
option_rows AS (
  SELECT
    arrayJoin(arrayConcat(
      ${columns.map(exactOptionRowsArrayExpression).join(",\n      ")}
    )) AS option${sampleFactorRow}
  FROM aggregated_options
)
SELECT
  option.column AS column,
  option.value AS value,
  ${countExpression} AS count,
  option.displayValue AS displayValue
FROM option_rows
ORDER BY column ASC, option.sortKey ASC, option.value ASC
`.trim();

  return {
    query,
    params: {
      ...aggregatedOptionsParams,
      optionLimit,
    },
  };
};

/** buildEventsMetadataValuesQuery builds the top-N distinct value query for one metadata key on the events table. */
export const buildEventsMetadataValuesQuery = (params: {
  projectId: string;
  filter: FilterState;
  key: string;
  limit: number;
  sampleRows?: number;
}): { query: string; params: Record<string, unknown> } | null => {
  if (params.limit <= 0 || params.key.length === 0) {
    return null;
  }

  const sampleRows = params.sampleRows ?? 0;
  const eventsFilter = new FilterList(
    createFilterFromFilterState(
      params.filter,
      eventsTableUiColumnDefinitions,
      eventsTableCols,
    ),
  );

  const valueAccessor =
    "e.metadata_values[indexOf(e.metadata_names, {metadataKey: String})]";
  const queryBuilder = new EventsAggQueryBuilder({
    projectId: params.projectId,
    groupByColumn: "value",
    selectExpression: `${valueAccessor} AS value, ${eventFilterOptionCountExpression(sampleRows)} AS count`,
  })
    .where(eventsFilter.apply())
    .whereRaw("has(e.metadata_names, {metadataKey: String})", {
      metadataKey: params.key,
    })
    .whereRaw(`length(${valueAccessor}) > 0`)
    .orderBy("ORDER BY count() DESC, value ASC")
    .limit(params.limit, 0)
    .sampleRows(sampleRows);

  return queryBuilder.buildWithParams();
};
