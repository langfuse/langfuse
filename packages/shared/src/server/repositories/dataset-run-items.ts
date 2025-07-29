import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
} from "../queries";
import { queryClickhouse } from "./clickhouse";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";
import { DatasetRunItemRecordReadType } from "./definitions";

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
          dri.trace_id as trace_id, 
          dri.observation_id as observation_id, 
          dri.dataset_id as dataset_id,
          dri.dataset_run_id as dataset_run_id, 
          dri.dataset_item_id as dataset_item_id, 
          dri.dataset_run_name as dataset_run_name,
          dri.dataset_run_description as dataset_run_description,
          dri.dataset_run_metadata as dataset_run_metadata,
          dri.created_at as created_at, 
          dri.updated_at as updated_at,
          dri.dataset_item_input as dataset_item_input,
          dri.dataset_item_expected_output as dataset_item_expected_output,
          dri.dataset_item_metadata as dataset_item_metadata,
          dri.is_deleted as is_deleted,
          dri.event_ts as event_ts`;
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
    ${opts.select === "rows" ? "LIMIT 1 BY dri.id, dri.project_id" : ""}
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

export const getDatasetRunItemsTableCh = async (
  opts: DatasetRunItemsTableQuery,
): Promise<DatasetRunItemDomain[]> => {
  const rows =
    await getDatasetRunItemsTableInternal<DatasetRunItemRecordReadType>({
      ...opts,
      select: "rows",
      tags: { kind: "list" },
    });

  return rows.map(convertDatasetRunItemClickhouseToDomain);
};
