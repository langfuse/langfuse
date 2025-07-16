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
import { MoreVertical } from "lucide-react";
import Page from "@/src/components/layouts/page";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";

export default function DatasetItems() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

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
            <NewDatasetItemButton projectId={projectId} datasetId={datasetId} />
            <UploadDatasetCsvButton
              projectId={projectId}
              datasetId={datasetId}
            />
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
          </>
        ),
      }}
    >
      <DatasetItemsTable projectId={projectId} datasetId={datasetId} />
    </Page>
  );
}
