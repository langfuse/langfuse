import { LISTABLE_SCORE_TYPES } from "../../../domain/scores";
import { scoresTableCols } from "../../../tableDefinitions/scoresTable";
import type { FilterState } from "../../../types";
import { scoresColumnsTableUiColumnDefinitions } from "../../tableMappings/mapScoresColumnsTable";
import { FilterList } from "./clickhouse-filter";
import { createFilterFromFilterState } from "./factory";

export const FILTER_OPTION_SCORE_NAME_LIMIT = 200;
export const FILTER_OPTION_CATEGORICAL_VALUE_LIMIT = 20;

/**
 * One `scores` scan that materialises every event-table score-name facet
 * via conditional aggregation (numeric / boolean / categorical / level).
 */
export const buildScoresFilterOptionsForEventFacetsQuery = (params: {
  projectId: string;
  timestampFilter: FilterState;
}): { query: string; params: Record<string, unknown> } => {
  const chFilter = createFilterFromFilterState(
    params.timestampFilter,
    scoresColumnsTableUiColumnDefinitions,
    scoresTableCols,
  );
  const filterRes = new FilterList(chFilter).apply();

  // The repository rolls these rows up into seven facets, each with a different
  // pool and count measure, and caps each independently. One shared cap cannot
  // reproduce all seven: a name outside one facet's top-N can top another, and a
  // name whose measure splits across sources or across NUMERIC/BOOLEAN can lead
  // its facet while trailing on every single (source, data_type) row. Rank each
  // facet on its own measure and keep a row that survives ANY cap, so each
  // roll-up reads a superset of its true top-N. Name-facet ranks partition per
  // name so a name's rows share one rank; column facets rank rows directly.
  const cap = FILTER_OPTION_SCORE_NAME_LIMIT;
  const query = `
    WITH grouped AS (
      SELECT
        s.name AS name,
        s.source AS source,
        s.data_type AS data_type,
        count() AS count,
        countIf(isNull(s.observation_id)) AS trace_count,
        countIf(isNotNull(s.observation_id)) AS observation_count,
        groupUniqArrayIf(${FILTER_OPTION_CATEGORICAL_VALUE_LIMIT})(
          s.string_value,
          s.data_type = 'CATEGORICAL'
        ) AS categorical_values,
        groupUniqArrayIf(${FILTER_OPTION_CATEGORICAL_VALUE_LIMIT})(
          s.string_value,
          s.data_type = 'CATEGORICAL' AND isNull(s.observation_id)
        ) AS trace_categorical_values,
        countIf(
          s.data_type = 'BOOLEAN'
          AND s.string_value IS NOT NULL
          AND s.string_value != ''
        ) AS boolean_value_count,
        countIf(
          s.data_type = 'BOOLEAN'
          AND s.string_value IS NOT NULL
          AND s.string_value != ''
          AND isNull(s.observation_id)
        ) AS trace_boolean_value_count
      FROM scores s
      WHERE s.project_id = {projectId: String}
        AND isNotNull(s.trace_id)
        AND s.data_type IN ({dataTypes: Array(String)})
        ${filterRes.query ? `AND ${filterRes.query}` : ""}
      GROUP BY name, source, data_type
    ),
    name_totals AS (
      SELECT
        grouped.*,
        sumIf(count, data_type IN ('NUMERIC', 'BOOLEAN'))
          OVER (PARTITION BY name) AS numeric_name_total,
        sum(boolean_value_count) OVER (PARTITION BY name) AS boolean_name_total,
        sumIf(count, data_type = 'CATEGORICAL')
          OVER (PARTITION BY name) AS categorical_name_total,
        sumIf(trace_count, data_type = 'CATEGORICAL')
          OVER (PARTITION BY name) AS trace_categorical_name_total,
        sum(trace_boolean_value_count)
          OVER (PARTITION BY name) AS trace_boolean_name_total
      FROM grouped
    ),
    ranked AS (
      SELECT
        name_totals.*,
        dense_rank() OVER (ORDER BY numeric_name_total DESC, name ASC)
          AS numeric_name_rank,
        dense_rank() OVER (ORDER BY boolean_name_total DESC, name ASC)
          AS boolean_name_rank,
        dense_rank() OVER (ORDER BY categorical_name_total DESC, name ASC)
          AS categorical_name_rank,
        dense_rank() OVER (ORDER BY trace_categorical_name_total DESC, name ASC)
          AS trace_categorical_name_rank,
        dense_rank() OVER (ORDER BY trace_boolean_name_total DESC, name ASC)
          AS trace_boolean_name_rank,
        dense_rank() OVER (
          ORDER BY observation_count DESC, name ASC, source ASC, data_type ASC
        ) AS observation_column_rank,
        dense_rank() OVER (
          ORDER BY trace_count DESC, name ASC, source ASC, data_type ASC
        ) AS trace_column_rank
      FROM name_totals
    )
    SELECT
      name,
      source,
      data_type,
      count,
      trace_count,
      observation_count,
      categorical_values,
      trace_categorical_values,
      boolean_value_count,
      trace_boolean_value_count
    FROM ranked
    WHERE numeric_name_rank <= {cap: UInt32}
      OR boolean_name_rank <= {cap: UInt32}
      OR categorical_name_rank <= {cap: UInt32}
      OR trace_categorical_name_rank <= {cap: UInt32}
      OR trace_boolean_name_rank <= {cap: UInt32}
      OR observation_column_rank <= {cap: UInt32}
      OR trace_column_rank <= {cap: UInt32}
  `.trim();

  return {
    query,
    params: {
      projectId: params.projectId,
      dataTypes: [...LISTABLE_SCORE_TYPES],
      cap,
      ...filterRes.params,
    },
  };
};
