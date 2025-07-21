export const DATASET_TABS = {
  RUNS: "runs",
  ITEMS: "items",
} as const;

export type DatasetTab = (typeof DATASET_TABS)[keyof typeof DATASET_TABS];

export const getDatasetTabs = (projectId: string, datasetId: string) => [
  {
    value: DATASET_TABS.RUNS,
    label: "Runs",
    href: `/project/${projectId}/datasets/${datasetId}`,
  },
  {
    value: DATASET_TABS.ITEMS,
    label: "Items",
    href: `/project/${projectId}/datasets/${datasetId}/items`,
  },
];
