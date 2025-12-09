import { useRouter } from "next/router";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { ViewDatasetItem } from "@/src/features/datasets/components/ViewDatasetItem";
import { DatasetItemDiffView } from "@/src/features/datasets/components/DatasetItemDiffView";
import { DatasetVersionHistoryPanel } from "@/src/features/datasets/components/DatasetVersionHistoryPanel";
import { DatasetVersionWarningBanner } from "@/src/features/datasets/components/DatasetVersionWarningBanner";
import { api } from "@/src/utils/api";
import {
  DatasetVersionProvider,
  useDatasetVersion,
} from "@/src/features/datasets/hooks/useDatasetVersion";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import useSessionStorage from "@/src/components/useSessionStorage";

function DatasetItemContent() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

  const { selectedVersion, resetToLatest } = useDatasetVersion();
  const isViewingOldVersion = selectedVersion !== null;

  const [showDiffMode, setShowDiffMode] = useSessionStorage(
    "datasetItem-showDiff",
    false,
  );

  // Fetch current item
  const item = api.datasets.itemById.useQuery(
    {
      datasetId,
      projectId,
      datasetItemId: itemId,
    },
    {
      refetchOnWindowFocus: false,
    },
  );

  // Fetch item at selected version if viewing old version
  const itemAtVersion = api.datasets.itemById.useQuery(
    {
      projectId,
      datasetId,
      datasetItemId: itemId,
      // validFrom: selectedVersion!,
    },
    {
      enabled: selectedVersion !== null,
    },
  );

  // Fetch dataset
  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  // Fetch item version history for sidebar indicators
  const itemVersionHistory = api.datasets.itemVersionHistory.useQuery({
    projectId,
    datasetId,
    itemId,
  });

  return (
    <DatasetItemDetailPage
      activeTab={DATASET_ITEM_TABS.ITEM}
      withPadding={false}
    >
      <div className="flex h-full">
        {/* Main content area */}
        <div className="flex flex-1 flex-col overflow-auto">
          {/* Banner without padding */}
          {isViewingOldVersion && selectedVersion && (
            <DatasetVersionWarningBanner
              selectedVersion={selectedVersion}
              resetToLatest={resetToLatest}
              variant="inline"
            />
          )}

          {/* Content with padding */}
          <div className="px-6 py-4">
            {isViewingOldVersion && selectedVersion && (
              <div className="mb-4 flex items-center space-x-2">
                <Switch
                  id="diff-mode"
                  checked={showDiffMode}
                  onCheckedChange={setShowDiffMode}
                />
                <Label htmlFor="diff-mode" className="cursor-pointer text-sm">
                  Show diff with latest version
                </Label>
              </div>
            )}

            {isViewingOldVersion ? (
              showDiffMode ? (
                // Show diff view when diff mode is enabled
                item.data && itemAtVersion.data ? (
                  <DatasetItemDiffView
                    selectedVersion={itemAtVersion.data}
                    latestVersion={item.data}
                  />
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Loading...
                  </div>
                )
              ) : (
                // Show normal view of selected version when diff mode is off
                itemAtVersion.data && (
                  <ViewDatasetItem
                    datasetItem={itemAtVersion.data}
                    dataset={
                      dataset.data
                        ? {
                            id: dataset.data.id,
                            name: dataset.data.name,
                            inputSchema: dataset.data.inputSchema ?? null,
                            expectedOutputSchema:
                              dataset.data.expectedOutputSchema ?? null,
                          }
                        : null
                    }
                  />
                )
              )
            ) : (
              // Show read-only view when viewing current version
              item.data && (
                <ViewDatasetItem
                  datasetItem={item.data}
                  dataset={
                    dataset.data
                      ? {
                          id: dataset.data.id,
                          name: dataset.data.name,
                          inputSchema: dataset.data.inputSchema ?? null,
                          expectedOutputSchema:
                            dataset.data.expectedOutputSchema ?? null,
                        }
                      : null
                  }
                />
              )
            )}
          </div>
        </div>

        {/* Version history sidebar */}
        <div className="w-80 shrink-0 border-l">
          <DatasetVersionHistoryPanel
            projectId={projectId}
            datasetId={datasetId}
            itemVersions={itemVersionHistory.data}
          />
        </div>
      </div>
    </DatasetItemDetailPage>
  );
}

export default function Dataset() {
  return (
    <DatasetVersionProvider>
      <DatasetItemContent />
    </DatasetVersionProvider>
  );
}
