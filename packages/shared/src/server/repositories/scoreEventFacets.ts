import { ScoreSourceType, ListableScoreDataType } from "../../domain/scores";
import {
  FILTER_OPTION_CATEGORICAL_VALUE_LIMIT,
  FILTER_OPTION_SCORE_NAME_LIMIT,
} from "../queries/clickhouse-sql/score-filter-options";

/**
 * One row of the combined score-name facet scan run by
 * `getScoresFilterOptionsForEventFacets`. Counts arrive as strings from
 * ClickHouse and are coerced once by the caller before it shapes each facet.
 */
export type EventFilterScoreNameRow = {
  name: string;
  source: string;
  data_type: string;
  count: string;
  trace_count: string;
  observation_count: string;
  categorical_values: string[];
  trace_categorical_values: string[];
  boolean_value_count: string;
  trace_boolean_value_count: string;
};

type EventFilterScoreColumn = {
  name: string;
  source: ScoreSourceType;
  dataType: ListableScoreDataType;
};

export type EventFilterScoreNameOptions = {
  numericNames: { name: string }[];
  booleanNames: { name: string }[];
  categoricalNames: { label: string; values: string[] }[];
  traceCategoricalNames: { label: string; values: string[] }[];
  traceBooleanNames: { name: string }[];
  observationLevelScores: EventFilterScoreColumn[];
  traceLevelScores: EventFilterScoreColumn[];
};

export const EMPTY_EVENT_FILTER_SCORE_NAME_OPTIONS: EventFilterScoreNameOptions =
  {
    numericNames: [],
    booleanNames: [],
    categoricalNames: [],
    traceCategoricalNames: [],
    traceBooleanNames: [],
    observationLevelScores: [],
    traceLevelScores: [],
  };

// Highest count first; name as a stable tiebreaker.
const compareNameCount = (
  left: { name: string; count: number },
  right: { name: string; count: number },
) => right.count - left.count || left.name.localeCompare(right.name);

// Sum counts per name, then keep the top names.
export const topNamesByCount = (
  rows: { name: string; count: number }[],
): { name: string }[] => {
  const byName = new Map<string, number>();
  for (const row of rows) {
    byName.set(row.name, (byName.get(row.name) ?? 0) + row.count);
  }

  return [...byName.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort(compareNameCount)
    .slice(0, FILTER_OPTION_SCORE_NAME_LIMIT)
    .map(({ name }) => ({ name }));
};

// Like topNamesByCount, but unions the categorical values seen per name.
export const topCategoricalByCount = (
  rows: { name: string; count: number; values: string[] }[],
): { label: string; values: string[] }[] => {
  const byName = new Map<string, { count: number; values: Set<string> }>();
  for (const row of rows) {
    const existing = byName.get(row.name) ?? { count: 0, values: new Set() };
    existing.count += row.count;
    for (const value of row.values) {
      existing.values.add(value);
    }
    byName.set(row.name, existing);
  }

  return [...byName.entries()]
    .map(([name, aggregate]) => ({
      name,
      count: aggregate.count,
      values: [...aggregate.values].slice(
        0,
        FILTER_OPTION_CATEGORICAL_VALUE_LIMIT,
      ),
    }))
    .sort(compareNameCount)
    .slice(0, FILTER_OPTION_SCORE_NAME_LIMIT)
    .map(({ name, values }) => ({ label: name, values }));
};

const toScoreColumn = (
  row: EventFilterScoreNameRow,
): EventFilterScoreColumn => ({
  name: row.name,
  source: row.source as ScoreSourceType,
  dataType: row.data_type as ListableScoreDataType,
});

// Top score columns keyed by the full name/source/data_type triple; rows are
// already one per column, so no aggregation is needed.
export const topScoreColumnsByCount = (
  rows: { row: EventFilterScoreNameRow; count: number }[],
): EventFilterScoreColumn[] =>
  rows
    .sort(
      (left, right) =>
        right.count - left.count ||
        left.row.name.localeCompare(right.row.name) ||
        left.row.source.localeCompare(right.row.source) ||
        left.row.data_type.localeCompare(right.row.data_type),
    )
    .slice(0, FILTER_OPTION_SCORE_NAME_LIMIT)
    .map(({ row }) => toScoreColumn(row));
