export const DATASET_ITEM_TABS = {
  ITEM: "item",
  RUNS: "runs",
} as const;

export type DatasetItemTab =
  (typeof DATASET_ITEM_TABS)[keyof typeof DATASET_ITEM_TABS];

export const getDatasetItemTabs = ({
  projectId,
  datasetId,
  itemId,
}: {
  projectId: string;
  datasetId: string;
  itemId: string;
}) => [
  {
    value: DATASET_ITEM_TABS.ITEM,
    label: "Item",
    href: `/project/${projectId}/datasets/${datasetId}/items/${itemId}`,
  },
  {
    value: DATASET_ITEM_TABS.RUNS,
    label: "Runs",
    href: `/project/${projectId}/datasets/${datasetId}/items/${itemId}/runs`,
  },
];
