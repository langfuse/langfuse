import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { DatasetItemsTable } from "@/src/features/datasets/components/DatasetItemsTable";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteButton } from "@/src/components/deleteButton";
import { NewDatasetItemButton } from "@/src/features/datasets/components/NewDatasetItemButton";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { UploadDatasetCsvButton } from "@/src/features/datasets/components/UploadDatasetCsvButton";
import { MarkdownOrJsonView } from "@/src/components/trace/IOPreview";
import { Button } from "@/src/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { FolderKanban } from "lucide-react";

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
    <FullScreenPage>
      <Header
        title={dataset.data?.name ?? ""}
        help={
          dataset.data?.description
            ? {
                description: dataset.data.description,
              }
            : undefined
        }
        breadcrumb={[
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
          {
            name: "Items",
          },
        ]}
        actionButtons={
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
                  Dataset details
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
                    <MarkdownOrJsonView
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
            <DatasetActionButton
              mode="update"
              projectId={projectId}
              datasetId={datasetId}
              datasetName={dataset.data?.name ?? ""}
              datasetDescription={dataset.data?.description ?? undefined}
              datasetMetadata={dataset.data?.metadata}
              icon
            />
            <DuplicateDatasetButton
              datasetId={datasetId}
              projectId={projectId}
            />
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
          </>
        }
      />

      <DatasetItemsTable
        projectId={projectId}
        datasetId={datasetId}
        menuItems={
          <Tabs value="items">
            <TabsList>
              <TabsTrigger value="runs" asChild>
                <Link href={`/project/${projectId}/datasets/${datasetId}`}>
                  Runs
                </Link>
              </TabsTrigger>
              <TabsTrigger value="items">Items</TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
    </FullScreenPage>
  );
}
