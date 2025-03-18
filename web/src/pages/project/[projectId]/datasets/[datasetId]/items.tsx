import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import Link from "next/link";
import { DatasetItemsTable } from "@/src/features/datasets/components/DatasetItemsTable";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteButton } from "@/src/components/deleteButton";
import { NewDatasetItemButton } from "@/src/features/datasets/components/NewDatasetItemButton";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { UploadDatasetCsvButton } from "@/src/features/datasets/components/UploadDatasetCsvButton";
import { MarkdownJsonView } from "@/src/components/ui/MarkdownJsonView";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { FolderKanban, MoreVertical } from "lucide-react";
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
  const utils = api.useUtils();

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
        tabsComponent: (
          <TabsBar value="items">
            <TabsBarList>
              <TabsBarTrigger value="runs" asChild>
                <Link href={`/project/${projectId}/datasets/${datasetId}`}>
                  Runs
                </Link>
              </TabsBarTrigger>
              <TabsBarTrigger value="items">Items</TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: [
          <>
            <NewDatasetItemButton projectId={projectId} datasetId={datasetId} />
            <UploadDatasetCsvButton
              projectId={projectId}
              datasetId={datasetId}
            />
            <Popover key="show-dataset-details">
              <PopoverTrigger asChild>
                <Button variant="outline">
                  <FolderKanban className="mr-2 h-4 w-4" />
                  <span className="hidden md:block">Dataset details</span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="mx-2 max-h-[50vh] w-[50vw] overflow-y-auto md:w-[25vw]">
                <div className="space-y-4">
                  <div>
                    <h4 className="mb-1 font-medium">Description</h4>
                    <span className="text-sm text-muted-foreground">
                      {dataset.data?.description ?? "No description"}
                    </span>
                  </div>
                  <div>
                    <h4 className="mb-1 font-medium">Metadata</h4>
                    <MarkdownJsonView
                      content={dataset.data?.metadata ?? null}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
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
                <DropdownMenuItem asChild>
                  <DeleteButton
                    itemId={datasetId}
                    projectId={projectId}
                    isTableAction={false}
                    scope="datasets:CUD"
                    invalidateFunc={() => void utils.datasets.invalidate()}
                    type="dataset"
                    redirectUrl={`/project/${projectId}/datasets`}
                    deleteConfirmation={dataset.data?.name}
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>,
        ],
      }}
    >
      <DatasetItemsTable projectId={projectId} datasetId={datasetId} />
    </Page>
  );
}
