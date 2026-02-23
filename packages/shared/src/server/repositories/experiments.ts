import { type OrderByState } from "../../interfaces/orderBy";
import { type FilterState } from "../../types";
import { measureAndReturn } from "../clickhouse/measureAndReturn";
import { FilterList, orderByToClickhouseSql } from "../queries";
import { createFilterFromFilterState } from "../queries/clickhouse-sql/factory";
import { eventsExperimentsAggregation } from "../queries/clickhouse-sql/query-fragments";
import { queryClickhouse } from "../repositories";
import { parseClickhouseUTCDateTimeFormat } from "../repositories/clickhouse";
import {
  experimentCols,
  experimentEventsFilterCols,
} from "../tableMappings/mapExperimentTable";

export type ExperimentEventsDataReturnType = {
  experiment_id: string;
  experiment_name: string;
  experiment_description: string | null;
  experiment_dataset_id: string;
  created_at: string;
  updated_at: string;
  item_count: number;
};

export type ExperimentEventsWithMetricsReturnType =
  ExperimentEventsDataReturnType & {
    total_cost: string;
    error_count: number;
    usage_details: Record<string, number>;
    cost_details: Record<string, number>;
  };

export const getExperimentsCountFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows = await getExperimentsFromEventsGeneric<{ count: string }>({
    select: "count",
    projectId: props.projectId,
    filter: props.filter,
    orderBy: props.orderBy,
    limit: props.limit,
    page: props.page,
    tags: { kind: "count" },
  });

  return rows.length > 0 ? Number(rows[0].count) : 0;
};

export const getExperimentsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getExperimentsFromEventsGeneric<ExperimentEventsDataReturnType>({
      select: "rows",
      projectId: props.projectId,
      filter: props.filter,
      orderBy: props.orderBy,
      limit: props.limit,
      page: props.page,
      tags: { kind: "list" },
    });

  return rows.map((row) => ({
    id: row.experiment_id,
    name: row.experiment_name,
    description: row.experiment_description,
    datasetId: row.experiment_dataset_id,
    itemCount: Number(row.item_count),
    createdAt: parseClickhouseUTCDateTimeFormat(row.created_at),
    updatedAt: parseClickhouseUTCDateTimeFormat(row.updated_at),
  }));
};

export const getExperimentsWithMetricsFromEvents = async (props: {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
}) => {
  const rows =
    await getExperimentsFromEventsGeneric<ExperimentEventsWithMetricsReturnType>(
      {
        select: "metrics",
        projectId: props.projectId,
        filter: props.filter,
        orderBy: props.orderBy,
        limit: props.limit,
        page: props.page,
        tags: { kind: "analytic" },
      },
    );

  return rows.map((row) => ({
    ...row,
    item_count: Number(row.item_count),
    error_count: Number(row.error_count),
    created_at: parseClickhouseUTCDateTimeFormat(row.created_at),
    updated_at: parseClickhouseUTCDateTimeFormat(row.updated_at),
  }));
};

export type FetchExperimentsFromEventsProps = {
  select: "count" | "rows" | "metrics";
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  page?: number;
  tags?: Record<string, string>;
};

const getExperimentsFromEventsGeneric = async <T>(
  props: FetchExperimentsFromEventsProps,
) => {
  const { select, projectId, filter, orderBy, limit, page } = props;

  // Build the aggregation query
  const builder = eventsExperimentsAggregation({ projectId });

  // Add appropriate fields based on select type
  switch (select) {
    case "count":
      // For count, we'll wrap the aggregation in a count query
      break;
    case "rows":
      builder.selectFieldSet("all");
      break;
    case "metrics":
      builder.selectFieldSet("all");
      break;
    default: {
      const exhaustiveCheckDefault: never = select;
      throw new Error(`Unknown select type: ${exhaustiveCheckDefault}`);
    }
  }

  // Apply filters if provided (these are WHERE clauses on events table BEFORE aggregation)
  if (filter.length > 0) {
    const experimentFilters = new FilterList(
      createFilterFromFilterState(filter, experimentEventsFilterCols),
    );
    const experimentFilterRes = experimentFilters.apply();
    if (experimentFilterRes.query) {
      builder.whereRaw(experimentFilterRes.query, experimentFilterRes.params);
    }
  }

  const { query: aggregationQuery, params } = builder.buildWithParams();

  // Wrap with count or select based on type
  let finalQuery: string;
  if (select === "count") {
    finalQuery = `SELECT count(*) as count FROM (${aggregationQuery}) AS experiments`;
  } else {
    finalQuery = `
      ${aggregationQuery}
      ${orderByToClickhouseSql(orderBy ?? null, experimentCols)}
      ${limit !== undefined && page !== undefined ? `LIMIT {limit: Int32} OFFSET {offset: Int32}` : ""}
    `;
  }

  return measureAndReturn({
    operationName: "getExperimentsFromEventsGeneric",
    projectId,
    input: {
      params: {
        ...params,
        limit: limit,
        offset: limit && page ? limit * page : 0,
      },
      tags: {
        ...(props.tags ?? {}),
        feature: "experiments",
        type: "experiments",
        projectId,
        operation_name: `getExperimentsFromEventsGeneric-${select}`,
      },
    },
    fn: async (input) => {
      return queryClickhouse<T>({
        query: finalQuery,
        params: input.params,
        tags: input.tags,
      });
    },
  });
};
