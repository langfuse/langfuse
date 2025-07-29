import { DatasetRunItemDomain } from "../../domain/dataset-run-items";
import { OrderByState } from "../../interfaces/orderBy";
import { datasetRunItemsTableUiColumnDefinitions } from "../../tableDefinitions";
import { FilterState } from "../../types";
import {
  createFilterFromFilterState,
  FilterList,
  orderByToClickhouseSql,
  StringFilter,
} from "../queries";
import { queryClickhouse } from "./clickhouse";
import { convertDatasetRunItemClickhouseToDomain } from "./dataset-run-items-converters";
import { DatasetRunItemRecordReadType } from "./definitions";
import { env } from "../../env";
import { commandClickhouse } from "./clickhouse";

type DatasetRunItemsTableQuery = {
  projectId: string;
  datasetId: string;
  filter: FilterState;
  orderBy?: OrderByState;
  limit?: number;
  offset?: number;
};

const getProjectDatasetIdDefaultFilter = (
  projectId: string,
  datasetId: string,
) => {
  return {
    datasetRunItemsFilter: new FilterList([
      new StringFilter({
        clickhouseTable: "dataset_run_items",
        field: "project_id",
        operator: "=",
        value: projectId,
      }),
      new StringFilter({
        clickhouseTable: "dataset_run_items",
        field: "dataset_id",
        operator: "=",
        value: datasetId,
      }),
    ]),
  };
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
          dri.error as error,
          dri.created_at as created_at, 
          dri.updated_at as updated_at,
          dri.dataset_run_name as dataset_run_name,
          dri.dataset_run_description as dataset_run_description,
          dri.dataset_run_metadata as dataset_run_metadata,
          dri.dataset_run_created_at as dataset_run_created_at,
          dri.dataset_item_input as dataset_item_input,
          dri.dataset_item_expected_output as dataset_item_expected_output,
          dri.dataset_item_metadata as dataset_item_metadata,
          dri.is_deleted as is_deleted,
          dri.event_ts as event_ts`;
      default:
        throw new Error(`Unknown select type: ${opts.select}`);
    }
  })();

  const { projectId, datasetId, filter, orderBy, limit, offset } = opts;

  const { datasetRunItemsFilter } = getProjectDatasetIdDefaultFilter(
    projectId,
    datasetId,
  );

  datasetRunItemsFilter.push(
    ...createFilterFromFilterState(
      filter,
      datasetRunItemsTableUiColumnDefinitions,
    ),
  );
  const appliedFilter = datasetRunItemsFilter.apply();

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
    -- We pull only the latest version of each dataset run item and assume a 1:1 mapping between dataset run items and dataset items.
    ${opts.select === "rows" ? "LIMIT 1 BY dri.id, dri.project_id, dri.dataset_item_id" : ""}
    ${limit !== undefined && offset !== undefined ? `LIMIT ${limit} OFFSET ${offset}` : ""};`;

  const res = await queryClickhouse<T>({
    query,
    params: {
      ...appliedFilter.params,
    },
    tags: {
      ...(opts.tags ?? {}),
      feature: "datasets",
      type: "dataset-run-items",
      projectId,
      datasetId,
    },
    // TODO: do I need to add clickhouseConfigs here?
  });

  return res;
};

export const getDatasetRunItemsByDatasetIdCh = async (
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

export const deleteDatasetRunItemsByProjectId = async ({
  projectId,
}: {
  projectId: string;
}) => {
  const query = `
      DELETE FROM dataset_run_items
      WHERE project_id = {projectId: String};
    `;
  await commandClickhouse({
    query: query,
    params: {
      projectId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteDatasetRunItemsByDatasetId = async ({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) => {
  const query = `
  DELETE FROM dataset_run_items
  WHERE project_id = {projectId: String}
  AND dataset_id = {datasetId: String}
`;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};

export const deleteDatasetRunItemsByDatasetRunIds = async ({
  projectId,
  datasetRunIds,
  datasetId,
}: {
  projectId: string;
  datasetRunIds: string[];
  datasetId: string;
}) => {
  const query = `
    DELETE FROM dataset_run_items
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_id IN ({datasetRunIds: Array(String)})
  `;

  await commandClickhouse({
    query,
    params: {
      projectId,
      datasetRunIds,
      datasetId,
    },
    clickhouseConfigs: {
      request_timeout: env.LANGFUSE_CLICKHOUSE_DELETION_TIMEOUT_MS,
    },
    tags: {
      feature: "datasets",
      type: "dataset-run-items",
      kind: "delete",
      projectId,
    },
  });
};
