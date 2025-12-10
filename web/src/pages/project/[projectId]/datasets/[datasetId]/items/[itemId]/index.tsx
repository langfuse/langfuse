import { useRouter } from "next/router";
import { DATASET_ITEM_TABS } from "@/src/features/navigation/utils/dataset-item-tabs";
import { DatasetItemDetailPage } from "@/src/features/datasets/components/DatasetItemDetailPage";
import { ViewDatasetItem } from "@/src/features/datasets/components/ViewDatasetItem";
import { DatasetItemDiffView } from "@/src/features/datasets/components/DatasetItemDiffView";
import { DatasetVersionHistoryPanel } from "@/src/features/datasets/components/DatasetVersionHistoryPanel";
import { DatasetVersionWarningBanner } from "@/src/features/datasets/components/DatasetVersionWarningBanner";
import { api } from "@/src/utils/api";
import { useDatasetVersion } from "@/src/features/datasets/hooks/useDatasetVersion";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import { Button } from "@/src/components/ui/button";
import useSessionStorage from "@/src/components/useSessionStorage";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { PanelRightClose, PanelRightOpen } from "lucide-react";
import { useState } from "react";

function DatasetItemContent() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

  const isVersioningEnabled = useIsFeatureEnabled("datasetVersioning");
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
          {isVersioningEnabled && isViewingOldVersion && selectedVersion && (
            <div className="sticky top-0 z-10">
              <DatasetVersionWarningBanner
                selectedVersion={selectedVersion}
                resetToLatest={resetToLatest}
              />
            </div>
          )}

          {/* Version panel toggle button */}
          {isVersioningEnabled && (
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
                    <PanelRightClose className="mr-2 h-4 w-4" />
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
          )}

          {/* Content with padding */}
          <div className="px-6 py-4">
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
            {isViewingOldVersion &&
              selectedVersion &&
              !itemChangedAtVersion && (
                <div className="mb-4 text-sm text-muted-foreground">
                  Item unchanged in this version
                </div>
              )}

            {isViewingOldVersion ? (
              itemAtVersion.isLoading ? (
                <div className="text-sm text-muted-foreground">Loading...</div>
              ) : itemAtVersion.data === null ? (
                // Item doesn't exist at this version (not created yet or deleted)
                <div className="flex flex-col items-center justify-center p-12 text-center">
                  <div className="text-muted-foreground">
                    <p className="text-lg font-medium">
                      Item does not exist at this version
                    </p>
                    <p className="mt-2 text-sm">
                      This dataset item either had not been created yet or was
                      deleted at the selected version timestamp.
                    </p>
                  </div>
                </div>
              ) : showDiffMode && itemChangedAtVersion ? (
                // Show diff view when diff mode is enabled
                item.isLoading || itemAtVersion.isLoading ? (
                  <div className="text-sm text-muted-foreground">
                    Loading...
                  </div>
                ) : item.data && itemAtVersion.data ? (
                  <DatasetItemDiffView
                    selectedVersion={itemAtVersion.data}
                    latestVersion={item.data}
                  />
                ) : !itemAtVersion.data ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="text-muted-foreground">
                      <p className="text-lg font-medium">Cannot show diff</p>
                      <p className="mt-2 text-sm">
                        The selected version of this item does not exist (not
                        yet created or was deleted at that time).
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-12 text-center">
                    <div className="text-muted-foreground">
                      <p className="text-lg font-medium">Cannot show diff</p>
                      <p className="mt-2 text-sm">
                        The latest version of this item does not exist (has been
                        deleted).
                      </p>
                    </div>
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
            ) : item.isLoading ? (
              <div className="text-sm text-muted-foreground">Loading...</div>
            ) : item.data === null ? (
              // Current item not found
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <div className="text-muted-foreground">
                  <p className="text-lg font-medium">Dataset item not found</p>
                  <p className="mt-2 text-sm">
                    This dataset item does not exist or has been deleted.
                  </p>
                </div>
              </div>
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
        {isVersioningEnabled && isVersionPanelOpen && (
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
