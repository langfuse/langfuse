export const DATASET_TABS = {
  ITEMS: "items",
  EXPERIMENTS: "experiments",
} as const;

export type DatasetTab = (typeof DATASET_TABS)[keyof typeof DATASET_TABS];

export const getDatasetTabs = (projectId: string, datasetId: string) => {
  return [
    {
      value: DATASET_TABS.ITEMS,
      label: "Items",
      href: `/project/${projectId}/datasets/${encodeURIComponent(datasetId)}/items`,
    },
    {
      value: DATASET_TABS.EXPERIMENTS,
      label: "Experiments",
      href: `/project/${projectId}/datasets/${encodeURIComponent(datasetId)}/experiments`,
    },
  ];
};
