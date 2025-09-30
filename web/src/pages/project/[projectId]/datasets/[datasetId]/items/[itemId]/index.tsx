import { useRouter } from "next/router";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { EditDatasetItem } from "@/src/features/datasets/components/EditDatasetItem";
import { api } from "@/src/utils/api";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

  const item = api.datasets.itemById.useQuery(
    {
      datasetId,
      projectId,
      datasetItemId: itemId,
    },
    {
      refetchOnWindowFocus: false, // breaks dirty form state
    },
  );

  return (
    <DatasetItemDetailPage activeTab={DATASET_ITEM_TABS.ITEM}>
      <EditDatasetItem
        key={itemId}
        projectId={projectId}
        datasetItem={item.data ?? null}
      />
    </DatasetItemDetailPage>
  );
}
