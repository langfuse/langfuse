import { encodeDatasetPathSegment } from "@/src/features/datasets/utils/encodeDatasetPathSegment";

export const DATASET_TABS = {
  RUNS: "runs",
  ITEMS: "items",
} as const;

export type DatasetTab = (typeof DATASET_TABS)[keyof typeof DATASET_TABS];

export const getDatasetTabs = (projectId: string, datasetId: string) => {
  return [
    {
      value: DATASET_TABS.RUNS,
      label: "Experiments",
      href: `/project/${projectId}/datasets/${encodeDatasetPathSegment(datasetId)}`,
    },
    {
      value: DATASET_TABS.ITEMS,
      label: "Items",
      href: `/project/${projectId}/datasets/${encodeDatasetPathSegment(datasetId)}/items`,
    },
  ];
};
