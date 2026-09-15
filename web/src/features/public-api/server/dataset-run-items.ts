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
  // Optional half-open `[fromTimestamp, toTimestamp)` window on the
  // run-item creation time. Both fields are independently optional; the
  // composed window can only narrow the result set, never widen it.
  // Mirrors the public-API surface in `GetDatasetRunItemsV1Query` and
  // matches the pattern used by sibling list endpoints.
  fromTimestamp?: string | null;
  toTimestamp?: string | null;
};

const buildCreatedAtFilters = (
  fromTimestamp: string | null | undefined,
  toTimestamp: string | null | undefined,
): Array<{
  column: string;
  operator: ">=" | "<";
  value: Date;
  type: "datetime";
}> => {
  const filters: Array<{
    column: string;
    operator: ">=" | "<";
    value: Date;
    type: "datetime";
  }> = [];

  if (fromTimestamp) {
    filters.push({
      column: "createdAt",
      operator: ">=",
      value: new Date(fromTimestamp),
      type: "datetime" as const,
    });
  }
  if (toTimestamp) {
    filters.push({
      column: "createdAt",
      operator: "<",
      value: new Date(toTimestamp),
      type: "datetime" as const,
    });
  }
  return filters;
};

export const generateDatasetRunItemsForPublicApi = async ({
  props,
}: {
  props: DatasetRunItemsQueryType;
}) => {
  const {
    datasetId,
    projectId,
    runId,
    limit,
    page,
    fromTimestamp,
    toTimestamp,
  } = props;

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
      ...buildCreatedAtFilters(fromTimestamp, toTimestamp),
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
  const { datasetId, projectId, runId, fromTimestamp, toTimestamp } = props;

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
      ...buildCreatedAtFilters(fromTimestamp, toTimestamp),
    ],
  });
};
