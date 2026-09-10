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

  // The repository sums each (name, source) group's count across sources before
  // ranking names, so bound by the per-name summed count — not by raw per-source
  // rows. Ranking rows before the roll-up would drop a name whose total is the
  // project's highest but is split thinly across sources. Rank names within each
  // data_type by summed count (name as the tiebreak, matching the JS cap), keep
  // the top-N names, and return all their source rows for the roll-up.
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
    with_name_total AS (
      SELECT
        grouped.*,
        sum(count) OVER (PARTITION BY data_type, name) AS name_total
      FROM grouped
    ),
    ranked AS (
      SELECT
        with_name_total.*,
        dense_rank() OVER (
          PARTITION BY data_type
          ORDER BY name_total DESC, name ASC
        ) AS name_rank
      FROM with_name_total
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
    WHERE name_rank <= {maxNamesPerType: UInt32}
  `.trim();

  return {
    query,
    params: {
      projectId: params.projectId,
      dataTypes: [...LISTABLE_SCORE_TYPES],
      maxNamesPerType: FILTER_OPTION_SCORE_NAME_LIMIT,
      ...filterRes.params,
    },
  };
};
