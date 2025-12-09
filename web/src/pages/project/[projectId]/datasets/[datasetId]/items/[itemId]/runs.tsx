import { useRouter } from "next/router";
import { DatasetRunItemsByItemTable } from "@/src/features/datasets/components/DatasetRunItemsByItemTable";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { DatasetVersionProvider } from "@/src/features/datasets/hooks/useDatasetVersion";

function DatasetItemRuns() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

  return (
    <DatasetItemDetailPage
      withPadding={false}
      activeTab={DATASET_ITEM_TABS.RUNS}
    >
      <DatasetRunItemsByItemTable
        projectId={projectId}
        datasetItemId={itemId}
        datasetId={datasetId}
      />
    </DatasetItemDetailPage>
  );
}

export default function Dataset() {
  return (
    <DatasetVersionProvider>
      <DatasetItemRuns />
    </DatasetVersionProvider>
  );
}
