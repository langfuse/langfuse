import Header from "@/src/components/layouts/header";
import PageContainer from "@/src/components/layouts/page-container";
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

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const itemId = router.query.itemId as string;

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

  return (
    <PageContainer
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
        actionButtonsLeft: [
          <>
            {item.data?.sourceTraceId && (
              <Button variant="outline" asChild>
                <Link
                  href={`/project/${projectId}/traces/${item.data.sourceTraceId}`}
                  title={`View source ${item.data.sourceObservationId ? "observation" : "trace"}`}
                >
                  <ListTree className="h-4 w-4" />
                </Link>
              </Button>
            )}
          </>,
        ],
        actionButtonsRight: [
          <DetailPageNav
            currentId={itemId}
            path={(entry) =>
              `/project/${projectId}/datasets/${datasetId}/items/${entry.id}`
            }
            listKey="datasetItems"
          />,
        ],
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
    </PageContainer>
  );
}
