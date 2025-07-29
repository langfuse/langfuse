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
  let selectString = "";

  switch (opts.select) {
    case "count":
      selectString = "count(*) as count";
      break;
    case "rows":
      selectString = `
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
      break;
    default:
      throw new Error(`Unknown select type: ${opts.select}`);
  }

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

  const query = `
    SELECT
      ${selectString}
    FROM dataset_run_items dri 
    WHERE ${appliedFilter.query}
    -- We pull only the latest version of each dataset run item and assume a 1:1 mapping between dataset run items and dataset items.
    AND dri.event_ts = (
      SELECT argMax(event_ts, event_ts) 
      FROM dataset_run_items dri2 
      WHERE dri2.project_id = dri.project_id 
        AND dri2.dataset_item_id = dri.dataset_item_id
        AND dri2.dataset_run_id = dri.dataset_run_id
    )
    ${chOrderBy}
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
