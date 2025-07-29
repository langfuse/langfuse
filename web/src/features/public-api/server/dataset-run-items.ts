import { transformDbDatasetRunItemToAPIDatasetRunItemCh } from "@/src/features/public-api/types/datasets";
import { isPresent } from "@langfuse/shared";
import {
  getDatasetRunItemsByDatasetIdCh,
  getDatasetRunItemsCountByDatasetIdCh,
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
      isPresent(page) && isPresent(limit) && page >= 1
        ? (page - 1) * limit
        : undefined,
  });

  return result.map(transformDbDatasetRunItemToAPIDatasetRunItemCh);
};

export const getDatasetRunItemsCountForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const { datasetId, projectId, runId } = props;

  return await getDatasetRunItemsCountByDatasetIdCh({
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
  });
};
