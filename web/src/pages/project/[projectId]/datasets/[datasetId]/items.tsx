import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import {
  getDatasetTabs,
  DATASET_TABS,
} from "@/src/features/navigation/utils/dataset-tabs";
import { DatasetItemsTable } from "@/src/features/datasets/components/DatasetItemsTable";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteDatasetButton } from "@/src/components/deleteButton";
import { NewDatasetItemButton } from "@/src/features/datasets/components/NewDatasetItemButton";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { UploadDatasetCsvButton } from "@/src/features/datasets/components/UploadDatasetCsvButton";
import { Button } from "@/src/components/ui/button";
import { History, MoreVertical } from "lucide-react";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { DatasetItemsOnboarding } from "@/src/components/onboarding/DatasetItemsOnboarding";
import { SidePanel, SidePanelContent } from "@/src/components/ui/side-panel";
import { DatasetVersionHistoryPanel } from "@/src/features/datasets/components/DatasetVersionHistoryPanel";
import { DatasetVersionWarningBanner } from "@/src/features/datasets/components/DatasetVersionWarningBanner";
import { useState } from "react";
import { useDatasetVersion } from "@/src/features/datasets/hooks/useDatasetVersion";

function DatasetItemsView() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;

  const { selectedVersion, resetToLatest } = useDatasetVersion();
  const isViewingOldVersion = selectedVersion !== null;

  const [isVersionPanelOpen, setIsVersionPanelOpen] = useState(false);

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const totalDatasetItemCount = api.datasets.countItemsByDatasetId.useQuery({
    projectId,
    datasetId,
  });

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

  return (
    <Page
      headerProps={{
        title: dataset.data?.name ?? "",
        itemType: "DATASET",
        help: dataset.data?.description
          ? {
              description: dataset.data.description,
            }
          : undefined,
        breadcrumb: [
          { name: "Datasets", href: `/project/${projectId}/datasets` },
        ],
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="flex flex-col [&>*]:w-full [&>*]:justify-start">
                <DropdownMenuItem asChild>
                  <DatasetActionButton
                    mode="update"
                    projectId={projectId}
                    datasetId={datasetId}
                    datasetName={dataset.data?.name ?? ""}
                    datasetDescription={dataset.data?.description ?? undefined}
                    datasetMetadata={dataset.data?.metadata}
                    datasetInputSchema={dataset.data?.inputSchema ?? undefined}
                    datasetExpectedOutputSchema={
                      dataset.data?.expectedOutputSchema ?? undefined
                    }
                  />
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <DuplicateDatasetButton
                    datasetId={datasetId}
                    projectId={projectId}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  onSelect={(event) => {
                    event.preventDefault();
                    return false;
                  }}
                >
                  <DeleteDatasetButton
                    itemId={datasetId}
                    projectId={projectId}
                    redirectUrl={`/project/${projectId}/datasets`}
                    deleteConfirmation={dataset.data?.name}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="outline"
              onClick={() => setIsVersionPanelOpen(!isVersionPanelOpen)}
              title="Version History"
            >
              <History className="mr-2 h-4 w-4" />
              Version History
            </Button>
          </>
        ),
      }}
    >
      {showOnboarding ? (
        <DatasetItemsOnboarding projectId={projectId} datasetId={datasetId} />
      ) : (
        <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden">
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

export default DatasetItemsView;
