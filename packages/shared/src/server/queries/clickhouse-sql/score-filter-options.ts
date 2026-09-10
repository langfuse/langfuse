import { LISTABLE_SCORE_TYPES } from "../../../domain/scores";
import { scoresTableCols } from "../../../tableDefinitions/scoresTable";
import type { FilterState } from "../../../types";
import { scoresColumnsTableUiColumnDefinitions } from "../../tableMappings/mapScoresColumnsTable";
import { FilterList } from "./clickhouse-filter";
import { createFilterFromFilterState } from "./factory";

export const FILTER_OPTION_SCORE_NAME_LIMIT = 200;
export const FILTER_OPTION_CATEGORICAL_VALUE_LIMIT = 20;

// Transfer bound on (name, source, data_type) groups. The 200-name UI cap is
// applied in TypeScript after summing across sources; this is only so a
// project with thousands of distinct groups does not return all of them.
const FILTER_OPTION_SCORE_GROUP_LIMIT = FILTER_OPTION_SCORE_NAME_LIMIT * 10;

/**
 * One `scores` scan that materialises every event-table score-name facet
 * via conditional aggregation (numeric / boolean / categorical / level).
 *
 * Counts of returned groups are exact. Which groups are returned is not:
 * ClickHouse keeps the most frequent (name, source, data_type) rows (ten
 * times the UI name cap) and drops the rest. A name whose mass splits
 * across sources or data types can fall out of a facet even when its
 * summed count would have ranked in that facet's top 200.
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
    ORDER BY count DESC, name ASC, source ASC, data_type ASC
    LIMIT {groupLimit: UInt32}
  `.trim();

  return {
    query,
    params: {
      projectId: params.projectId,
      dataTypes: [...LISTABLE_SCORE_TYPES],
      groupLimit: FILTER_OPTION_SCORE_GROUP_LIMIT,
      ...filterRes.params,
    },
  };
};
