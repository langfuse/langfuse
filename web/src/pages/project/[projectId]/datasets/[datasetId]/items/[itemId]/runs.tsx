import { useRouter } from "next/router";
import { useEffect } from "react";
import { DatasetRunItemsByItemTable } from "@/src/features/datasets/components/DatasetRunItemsByItemTable";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { useExperimentAccess } from "@/src/features/experiments/hooks/useExperimentAccess";

function DatasetItemRuns() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

  // The per-item runs view reads legacy dataset_run_items and has no
  // events-backed equivalent, so fast-preview (v4) users are redirected back to
  // the item detail (the Experiments tab is also hidden for them).
  const { isExperimentsBetaActive, isInitializing } = useExperimentAccess();
  useEffect(() => {
    if (isInitializing || !isExperimentsBetaActive || !projectId) return;
    router.replace(
      `/project/${projectId}/datasets/${datasetId}/items/${itemId}`,
    );
  }, [
    isExperimentsBetaActive,
    isInitializing,
    projectId,
    datasetId,
    itemId,
    router,
  ]);

  if (isExperimentsBetaActive) return null;

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

export default DatasetItemRuns;
