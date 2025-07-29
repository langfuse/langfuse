import { transformDbDatasetRunItemToAPIDatasetRunItemCh } from "@/src/features/public-api/types/datasets";
import { isPresent } from "@langfuse/shared";
import {
  getDatasetRunItemsByDatasetIdCh,
  queryClickhouse,
} from "@langfuse/shared/src/server";

type DatasetRunItemsQueryType = {
  datasetId: string;
  runId: string;
  page?: number;
  limit?: number;
  projectId: string;
};

export const generateDatasetRunItemsForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runId, limit, page } = props;

  const result = await getDatasetRunItemsByDatasetIdCh({
    projectId,
    datasetId,
    filter: [
      {
        column: "datasetRunId",
        operator: "any of",
        value: [runId],
        type: "stringOptions" as const,
      },
    ],
    orderBy: {
      column: "createdAt",
      order: "DESC",
    },
    limit: limit,
    offset:
      isPresent(page) && isPresent(limit) ? (page - 1) * limit : undefined,
  });

  return result.map(transformDbDatasetRunItemToAPIDatasetRunItemCh);
};

export const getDatasetRunItemsCountForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runId } = props;

  const query = `
    SELECT count() as count
    FROM dataset_run_items dri
    WHERE project_id = {projectId: String}
    AND dataset_id = {datasetId: String}
    AND dataset_run_id = {runId: String}
  `;

  const records = await queryClickhouse<{ count: string }>({
    query,
    params: { projectId, datasetId, runId },
  });
  return records.map((record) => Number(record.count)).shift() ?? 0;
};
