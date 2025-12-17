import { useRouter } from "next/router";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { DatasetItemViewModeContent } from "@/src/features/datasets/components/DatasetItemViewModeContent";
import { DatasetItemVersionedContent } from "@/src/features/datasets/components/DatasetItemVersionedContent";
import { DatasetVersionHistoryPanel } from "@/src/features/datasets/components/DatasetVersionHistoryPanel";
import { DatasetVersionWarningBanner } from "@/src/features/datasets/components/DatasetVersionWarningBanner";
import { api } from "@/src/utils/api";
import { useDatasetVersion } from "@/src/features/datasets/hooks/useDatasetVersion";
import { toDatasetSchema } from "@/src/features/datasets/utils/datasetItemUtils";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import { Button } from "@/src/components/ui/button";
import useSessionStorage from "@/src/components/useSessionStorage";
import { History, PanelRightOpen } from "lucide-react";
import { useState } from "react";

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
  const [isVersionPanelOpen, setIsVersionPanelOpen] =
    useState(!!selectedVersion);

  // Fetch current item
  const item = api.datasets.itemByIdAtVersion.useQuery(
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
  const itemAtVersion = api.datasets.itemByIdAtVersion.useQuery(
    {
      projectId,
      datasetId,
      datasetItemId: itemId,
      version: selectedVersion!,
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

  // Check if item was changed at selected version (enables diff toggle)
  // Use 1 second tolerance to account for potential timestamp precision issues
  const itemChangedAtVersion =
    selectedVersion &&
    itemVersionHistory.data?.some(
      (v) => Math.abs(v.getTime() - selectedVersion.getTime()) < 1000,
    );

  return (
    <DatasetItemDetailPage
      activeTab={DATASET_ITEM_TABS.ITEM}
      withPadding={false}
    >
      <div className="flex h-full">
        {/* Main content area */}
        <div className="relative flex flex-1 flex-col overflow-auto">
          {/* Sticky banner without padding */}
          {isViewingOldVersion && selectedVersion && (
            <div className="sticky top-0 z-10">
              <DatasetVersionWarningBanner
                selectedVersion={selectedVersion}
                resetToLatest={resetToLatest}
              />
            </div>
          )}

          {/* Version panel toggle button */}
          <div className="sticky top-0 z-10 flex justify-end border-b bg-background p-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsVersionPanelOpen(!isVersionPanelOpen)}
              title={
                isVersionPanelOpen
                  ? "Hide version history"
                  : "Show version history"
              }
            >
              {isVersionPanelOpen ? (
                <>
                  <History className="mr-2 h-4 w-4" />
                  Hide Version History
                </>
              ) : (
                <>
                  <PanelRightOpen className="mr-2 h-4 w-4" />
                  Show Version History
                </>
              )}
            </Button>
          </div>

          {/* Content with padding */}
          <div className="px-6 py-4">
            {/* Diff mode toggle */}
            {isViewingOldVersion && selectedVersion && itemChangedAtVersion && (
              <div className="mb-4 flex flex-col gap-2">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="diff-mode"
                    checked={showDiffMode}
                    onCheckedChange={setShowDiffMode}
                  />
                  <Label htmlFor="diff-mode" className="cursor-pointer text-sm">
                    Show diff with latest version
                  </Label>
                </div>
              </div>
            )}

            {/* Item unchanged message */}
            {isViewingOldVersion &&
              selectedVersion &&
              !itemChangedAtVersion && (
                <div className="mb-4 text-sm text-muted-foreground">
                  Item unchanged in this version
                </div>
              )}

            {/* Main content area */}
            {isViewingOldVersion ? (
              <DatasetItemVersionedContent
                itemAtVersion={itemAtVersion.data ?? null}
                latestItem={item.data ?? null}
                isLoadingVersioned={itemAtVersion.isLoading}
                isLoadingLatest={item.isLoading}
                showDiffMode={showDiffMode}
                itemChangedAtVersion={!!itemChangedAtVersion}
                dataset={toDatasetSchema(dataset.data ?? null)}
              />
            ) : (
              <DatasetItemViewModeContent
                item={item.data ?? null}
                isLoading={item.isLoading}
                dataset={toDatasetSchema(dataset.data ?? null)}
              />
            )}
          </div>
        </div>

        {/* Version history sidebar */}
        {isVersionPanelOpen && (
          <div className="w-1/4 shrink-0 border-l">
            <DatasetVersionHistoryPanel
              projectId={projectId}
              datasetId={datasetId}
              itemVersions={itemVersionHistory.data}
            />
          </div>
        )}
      </div>
    </DatasetItemDetailPage>
  );
}

export default DatasetItemContent;
