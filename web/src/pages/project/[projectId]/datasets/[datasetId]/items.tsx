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
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";

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
            <DetailPageNav
              currentId={datasetId}
              path={(id) => `/project/${projectId}/datasets/${id}/items/`}
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
            <DeleteButton
              itemId={datasetId}
              projectId={projectId}
              isTableAction={false}
              scope="datasets:CUD"
              invalidateFunc={() => void utils.datasets.invalidate()}
              type="dataset"
              redirectUrl={`/project/${projectId}/datasets`}
            />
          </>
        }
      />

      {!!dataset.data?.metadata && (
        <JSONView json={dataset?.data.metadata} title="Metadata" />
      )}

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
