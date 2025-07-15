import { transformDbDatasetRunItemToAPIDatasetRunItemCh } from "@/src/features/public-api/types/datasets";
import {
  getDatasetRunItemsTableCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";

type DatasetRunItemsQueryType = {
  projectId: string;
  datasetId: string;
  runName: string;
  page?: number;
  limit?: number;
};

export const generateDatasetRunItemsForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runName, limit, page } = props;

  const result = await getDatasetRunItemsTableCh({
    projectId,
    filter: [
      {
        column: "dataset_id",
        operator: "=",
        value: datasetId,
        type: "string" as const,
      },
      {
        column: "dataset_run_name",
        operator: "any of",
        value: [runName],
        type: "arrayOptions" as const,
      },
    ],
    orderBy: {
      column: "created_at",
      order: "DESC",
    },
    limit: limit,
    offset: page && limit ? page * limit : undefined,
  });

  return result.map(transformDbDatasetRunItemToAPIDatasetRunItemCh);
};

export const getDatasetRunItemsCountForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runName } = props;

  const query = `
    SELECT count() as count
    FROM dataset_run_items dri
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_name = {runName: String}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { projectId: projectId, datasetId: datasetId, runName: runName },
  });
  return records.map((record) => Number(record.count)).shift();
};
