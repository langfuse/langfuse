import { queryClickhouse } from "./clickhouse";
import { createFilterFromFilterState } from "../queries/clickhouse-filter/factory";
import { FilterState } from "../../types";
import { logger } from "../logger";
import { FilterList } from "../queries/clickhouse-filter/clickhouse-filter";
import { observationsTableUiColumnDefinitions } from "../../tableDefinitions";
import { dashboardColumnDefinitions } from "../../tableDefinitions/mapDashboards";

export const getTotalTraces = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      count(id) as count 
    FROM traces t FINAL 
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}`;

  const result = await queryClickhouse<{ count: number }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
    },
  });

  if (result.length === 0) {
    return undefined;
  }

  return [{ countTraceId: result[0].count }];
};

export const getObservationsCostGroupedByName = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      provided_model_name as name,
      sumMap(cost_details)['total'] as sum_cost_details,
      sumMap(usage_details)['total'] as sum_usage_details
    FROM observations o FINAL LEFT JOIN traces t ON o.trace_id = t.id AND o.project_id = t.project_id
    WHERE project_id = {projectId: String}
    AND ${chFilter.query}
    GROUP BY provided_model_name
    ORDER BY sumMap(cost_details)['total'] DESC
    `;

  const result = await queryClickhouse<{
    name: string;
    sum_cost_details: number;
    sum_usage_details: number;
  }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
    },
  });

  return result;
};

export const getScoreAggregate = async (
  projectId: string,
  filter: FilterState,
) => {
  const chFilter = new FilterList(
    createFilterFromFilterState(filter, dashboardColumnDefinitions),
  ).apply();

  const query = `
    SELECT 
      s.name,
      count(*) as count,
      avg(s.value) as avg_value,
      s.source,
      s.data_type
    FROM scores s FINAL JOIN traces t FINAL ON t.id = s.trace_id AND t.project_id = s.project_id
    WHERE s.project_id = {projectId: String}
    AND ${chFilter.query}
    GROUP BY s.name, s.source, s.data_type
    ORDER BY count(*) DESC
    `;

  const result = await queryClickhouse<{
    name: string;
    count: string;
    avg_value: string;
    source: string;
    data_type: string;
  }>({
    query,
    params: {
      projectId,
      ...chFilter.params,
    },
  });

  return result;
};
