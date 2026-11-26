import { api } from "@/src/utils/api";

import {
  toDatasetSchema,
  type DatasetSchema,
} from "@/src/features/datasets/utils/datasetItemUtils";
import type { DatasetItemDomain } from "@langfuse/shared";

export function useEditDatasetItemDialogData({
  projectId,
  datasetId,
  datasetItemId,
  enabled,
}: {
  projectId: string;
  datasetId: string;
  datasetItemId: string;
  enabled: boolean;
}) {
  const datasetItemQuery = api.datasets.itemById.useQuery(
    {
      projectId,
      datasetId,
      datasetItemId,
    },
    {
      enabled,
      meta: { silentHttpCodes: [404] },
    },
  );
  const datasetQuery = api.datasets.byId.useQuery(
    {
      projectId,
      datasetId,
    },
    { enabled },
  );

  const datasetItem: DatasetItemDomain | undefined = datasetItemQuery.data;
  const dataset: DatasetSchema | null = toDatasetSchema(
    datasetQuery.data ?? null,
  );

  const isLoading =
    enabled && (datasetItemQuery.isPending || datasetQuery.isPending);
  const isNotFound =
    enabled && datasetItemQuery.isFetched && datasetItem == null;

  return {
    datasetItem,
    dataset,
    isLoading,
    isNotFound,
  };
}
