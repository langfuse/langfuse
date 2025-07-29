import { transformDbDatasetRunItemToAPIDatasetRunItemCh } from "@/src/features/public-api/types/datasets";
import { isPresent } from "@langfuse/shared";
import {
  getDatasetRunItemsByDatasetIdCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";

type DatasetRunItemsQueryType = {
  datasetId: string;
  runName: string;
  page?: number;
  limit?: number;
  projectId: string;
};

export const generateDatasetRunItemsForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runName, limit, page } = props;

  const result = await getDatasetRunItemsByDatasetIdCh({
    projectId,
    datasetId,
    filter: [
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
    offset: isPresent(page) && isPresent(limit) ? page * limit : undefined,
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
  return records.map((record) => Number(record.count)).shift() ?? 0;
};
