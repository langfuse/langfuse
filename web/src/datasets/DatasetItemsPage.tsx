import { api } from "@/src/app/utils/api";
import { getDatasetTabs, DATASET_TABS } from "@/src/app/shell/navigation";
import { DatasetItemsTable } from "@/src/datasets/components/DatasetItemsTable";
import { DetailPageNav } from "@/src/app/shell/navigate-detail-pages";
import { NewDatasetItemButton } from "@/src/datasets/components/NewDatasetItemButton";
import { UploadDatasetCsvButton } from "@/src/datasets/components/UploadDatasetCsvButton";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import { History, MoreVertical } from "lucide-react";
import Page from "@/src/app/shell/layouts/page";
import { DatasetItemsOnboarding } from "@/src/app/onboarding/shared-components/DatasetItemsOnboarding";
import {
  SidePanel,
  SidePanelContent,
} from "@/src/app/design-system/legacy-primitives/side-panel";
import { DatasetVersionHistoryPanel } from "@/src/datasets/components/DatasetVersionHistoryPanel";
import { DatasetVersionWarningBanner } from "@/src/datasets/components/DatasetVersionWarningBanner";
import { useState } from "react";
import { useDatasetVersion } from "@/src/datasets/hooks/useDatasetVersion";
import { getDatasetBreadcrumb } from "@/src/datasets/utils/getDatasetBreadcrumb";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/app/hooks/useReadyRouteParams";
import { DatasetActionMenu } from "@/src/datasets/components/DatasetActionMenu";

export default function DatasetItemsPage() {
  const route = useReadyRouteParams(["projectId", "datasetId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <DatasetItemsView
      projectId={route.params.projectId}
      datasetId={route.params.datasetId}
    />
  );
}

function DatasetItemsView({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) {
  const { selectedVersion, resetToLatest } = useDatasetVersion();
  const isViewingOldVersion = selectedVersion !== null;

  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);

  const dataset = api.datasets.byId.useQuery(
    {
      datasetId,
      projectId,
    },
    { enabled: Boolean(projectId) && Boolean(datasetId) },
  );

  const totalDatasetItemCount = api.datasets.countItemsByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    { enabled: Boolean(projectId) && Boolean(datasetId) },
  );

  const showOnboarding =
    totalDatasetItemCount.isSuccess && totalDatasetItemCount.data === 0;

  // Fetch change counts since selected version
  const changeCounts = api.datasets.countChangesSinceVersion.useQuery(
    {
      projectId,
      datasetId,
      version: selectedVersion!,
    },
    {
      enabled: selectedVersion !== null,
    },
  );

  const handlePanelOpenChange = (open: boolean) => {
    setIsVersionPanelOpen(open);
  };

  const breadcrumb = getDatasetBreadcrumb(
    projectId,
    datasetId,
    dataset.data?.name,
  );

  return (
    <Page
      headerProps={{
        title: dataset.data?.name ?? "",
        itemType: "DATASET",
        breadcrumb,
        tabsProps: {
          tabs: getDatasetTabs(projectId, datasetId),
          activeTab: DATASET_TABS.ITEMS,
        },
        actionButtonsRight: (
          <>
            {!showOnboarding && (
              <>
                <NewDatasetItemButton
                  projectId={projectId}
                  datasetId={datasetId}
                />
                <UploadDatasetCsvButton
                  projectId={projectId}
                  datasetId={datasetId}
                />
              </>
            )}
            <DetailPageNav
              currentId={datasetId}
              path={(entry) =>
                `/project/${projectId}/datasets/${entry.id}/items/`
              }
              listKey="datasets"
            />
            <DatasetActionMenu
              projectId={projectId}
              datasetId={datasetId}
              datasetName={dataset.data?.name ?? ""}
              datasetDescription={dataset.data?.description ?? undefined}
              datasetMetadata={dataset.data?.metadata}
              datasetInputSchema={dataset.data?.inputSchema ?? undefined}
              datasetExpectedOutputSchema={
                dataset.data?.expectedOutputSchema ?? undefined
              }
            >
              {({ getTriggerProps }) => (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Dataset actions"
                  {...getTriggerProps()}
                >
                  <MoreVertical className="icon-base text-icon-foreground" />
                </Button>
              )}
            </DatasetActionMenu>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setIsVersionPanelOpen(!isVersionPanelOpen)}
              title="Version History"
            >
              <History className="icon-base text-icon-foreground" />
            </Button>
          </>
        ),
      }}
    >
      {showOnboarding ? (
        <DatasetItemsOnboarding projectId={projectId} datasetId={datasetId} />
      ) : (
        <div className="grid flex-1 grid-cols-[1fr_auto] overflow-hidden">
          <div className="flex h-full flex-col overflow-hidden">
            {isViewingOldVersion && selectedVersion && (
              <DatasetVersionWarningBanner
                selectedVersion={selectedVersion}
                resetToLatest={resetToLatest}
                changeCounts={changeCounts.data}
              />
            )}
            <DatasetItemsTable projectId={projectId} datasetId={datasetId} />
          </div>
          <SidePanel
            id="version-history-panel"
            openState={{
              open: isVersionPanelOpen,
              onOpenChange: handlePanelOpenChange,
            }}
            mobileTitle="Version History"
          >
            <SidePanelContent className="h-full">
              <DatasetVersionHistoryPanel
                projectId={projectId}
                datasetId={datasetId}
              />
            </SidePanelContent>
          </SidePanel>
        </div>
      )}
    </Page>
  );
}
