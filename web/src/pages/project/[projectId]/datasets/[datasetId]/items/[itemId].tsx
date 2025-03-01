import Header from "@/src/components/layouts/header";
import Page from "@/src/components/layouts/page";
import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { DatasetRunItemsTable } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { EditDatasetItem } from "@/src/features/datasets/components/EditDatasetItem";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
import { ListTree } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/router";
import { DatasetStatus } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { useState } from "react";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;
  const hasAccess = useHasProjectAccess({ projectId, scope: "datasets:CUD" });
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [isArchivePopoverOpen, setIsArchivePopoverOpen] = useState(false);

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });
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

  const mutUpdate = api.datasets.updateDatasetItem.useMutation({
    onSuccess: () => {
      utils.datasets.invalidate();
      setIsArchivePopoverOpen(false);
    },
  });

  const toggleArchiveStatus = () => {
    if (!item.data?.status || !hasAccess || mutUpdate.isLoading) return;

    const newStatus =
      item.data.status === DatasetStatus.ARCHIVED
        ? DatasetStatus.ACTIVE
        : DatasetStatus.ARCHIVED;

    capture("dataset_item:archive_toggle", {
      status: newStatus === DatasetStatus.ARCHIVED ? "archived" : "unarchived",
    });

    mutUpdate.mutate({
      projectId,
      datasetId,
      datasetItemId: itemId,
      status: newStatus,
    });
  };

  return (
    <Page
      headerProps={{
        title: itemId,
        itemType: "DATASET_ITEM",
        breadcrumb: [
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
          {
            name: "Items",
            href: `/project/${projectId}/datasets/${datasetId}/items`,
          },
        ],
        actionButtonsLeft: (
          <>
            {item.data?.status && (
              <Popover
                open={isArchivePopoverOpen}
                onOpenChange={setIsArchivePopoverOpen}
              >
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="xs">
                    {item.data.status}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start" side="bottom">
                  <div className="flex flex-col gap-4">
                    <div className="space-y-2">
                      <h4 className="font-medium leading-none">
                        {item.data.status === DatasetStatus.ACTIVE
                          ? "Archive this item?"
                          : "Unarchive this item?"}
                      </h4>
                      <p className="text-sm text-muted-foreground">
                        Archiving an item will exclude it from new experiment
                        runs.
                      </p>
                    </div>
                    <Button
                      onClick={toggleArchiveStatus}
                      disabled={!hasAccess || mutUpdate.isLoading}
                      variant={
                        item.data.status === DatasetStatus.ACTIVE
                          ? "destructive"
                          : "default"
                      }
                      size="sm"
                    >
                      {mutUpdate.isLoading
                        ? "Processing..."
                        : item.data.status === DatasetStatus.ACTIVE
                          ? "Archive"
                          : "Unarchive"}
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
            {item.data?.sourceTraceId && (
              <Button variant="ghost" size="icon-xs" asChild>
                <Link
                  href={`/project/${projectId}/traces/${item.data.sourceTraceId}`}
                  title={`View source ${item.data.sourceObservationId ? "observation" : "trace"}`}
                >
                  <ListTree className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </>
        ),
        actionButtonsRight: (
          <DetailPageNav
            currentId={itemId}
            path={(entry) =>
              `/project/${projectId}/datasets/${datasetId}/items/${entry.id}`
            }
            listKey="datasetItems"
          />
        ),
      }}
    >
      <ResizablePanelGroup direction="vertical">
        <ResizablePanel
          minSize={10}
          defaultSize={50}
          className="!overflow-y-auto"
        >
          <EditDatasetItem
            key={item.data?.id}
            projectId={projectId}
            datasetItem={item.data ?? null}
          />
        </ResizablePanel>
        <ResizableHandle withHandle className="bg-border" />
        <ResizablePanel minSize={10} className="flex flex-col space-y-4">
          <Header title="Runs" />
          <DatasetRunItemsTable
            projectId={projectId}
            datasetItemId={itemId}
            datasetId={datasetId}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </Page>
  );
}
