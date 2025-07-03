import { OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
} from "../queries";
import {
  type FullDatasetRunItem,
  type FullDatasetRunItems,
} from "../queries/createDatasetRunItemsQuery";
import { queryClickhouse } from "./clickhouse";

type DatasetRunItemsTableQuery = {
  projectId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

const getDatasetRunItemsTableInternal = async <T>(
  opts: DatasetRunItemsTableQuery & {
    select: "count" | "rows";
    tags: Record<string, string>;
  },
): Promise<Array<T>> => {
  const selectString = (() => {
    switch (opts.select) {
      case "count":
        return "count(*) as count";
      case "rows":
        return `
          dri.id as id, 
          dri.project_id as project_id, 
          dri.dataset_run_id as dataset_run_id, 
          dri.dataset_item_id as dataset_item_id, 
          dri.trace_id as trace_id, 
          dri.observation_id as observation_id, 
          dri.created_at as created_at, 
          dri.updated_at as updated_at, 
          dri.dataset_item_created_at as dataset_item_created_at`;
      default:
        throw new Error(`Unknown select type: ${opts.select}`);
    }
  })();

  const { projectId, filter, orderBy, limit, offset } = opts;
  const chFilter = createFilterFromFilterState(
    filter,
    datasetRunItemsTableUiColumnDefinitions,
  );
  const appliedFilter = new FilterList(chFilter).apply();

  const chOrderBy = orderByToClickhouseSql(
    orderBy ?? null,
    datasetRunItemsTableUiColumnDefinitions,
  );

  // joins with traces are very expensive. We need to filter by time as well.
  // We assume that a trace has to have been within a 24 h before and after interval of the dataset run to be relevant.

  const query = `
    SELECT
      ${selectString}
    FROM dataset_run_items dri 
    WHERE ${appliedFilter.query}
    ${chOrderBy}
    ${opts.select === "rows" ? "LIMIT 1 BY o.id, o.project_id" : ""}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...appliedFilter.params,
    },
    tags: {
      ...(opts.tags ?? {}),
      feature: "dataset-run-items",
      type: "dataset-run-items",
      projectId,
    },
    // TODO: do I need to add clickhouseConfigs here?
  });

  return res;
};

export const getDatasetRunItemsTableCountCh = async (
  opts: DatasetRunItemsTableQuery,
) => {
  const count = await getDatasetRunItemsTableInternal<{
    count: string;
  }>({
    ...opts,
    select: "count",
    tags: { kind: "count" },
  });

  return Number(count[0].count);
};

export const getDatasetRunItemsTableCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<FullDatasetRunItems> => {
  const rows = await getDatasetRunItemsTableInternal<FullDatasetRunItem>({
    ...opts,
    select: "rows",
    tags: { kind: "list" },
  });

  return rows;
};
