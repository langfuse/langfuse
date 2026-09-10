import { LISTABLE_SCORE_TYPES, ScoreSourceArray } from "../../../domain/scores";
import { scoresTableCols } from "../../../tableDefinitions/scoresTable";
import type { FilterState } from "../../../types";
import { scoresColumnsTableUiColumnDefinitions } from "../../tableMappings/mapScoresColumnsTable";
import { FilterList } from "./clickhouse-filter";
import { createFilterFromFilterState } from "./factory";

export const FILTER_OPTION_SCORE_NAME_LIMIT = 200;
export const FILTER_OPTION_CATEGORICAL_VALUE_LIMIT = 20;
// Enough (name, source) groups per data_type for the 200-name JS cap after
// collapsing sources. LIMIT BY data_type keeps facets from starving each other.
export const FILTER_OPTION_SCORE_GROUPS_PER_TYPE_LIMIT =
  FILTER_OPTION_SCORE_NAME_LIMIT * ScoreSourceArray.length;

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

  const query = `
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
    ORDER BY count DESC
    LIMIT {maxGroupsPerType: UInt32} BY data_type
  `.trim();

  return {
    query,
    params: {
      projectId: params.projectId,
      dataTypes: [...LISTABLE_SCORE_TYPES],
      maxGroupsPerType: FILTER_OPTION_SCORE_GROUPS_PER_TYPE_LIMIT,
      ...filterRes.params,
    },
  };
};
