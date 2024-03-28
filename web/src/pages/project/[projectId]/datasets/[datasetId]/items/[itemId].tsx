import Header from "@/src/components/layouts/header";
import { DatasetRunItemsTable } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { EditDatasetItem } from "@/src/features/datasets/components/EditDatasetItem";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
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

  return (
    <div>
      <Header
        title={`Dataset Item`}
        breadcrumb={[
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
          {
            name: "Items",
            href: `/project/${projectId}/datasets/${datasetId}/items`,
          },
          { name: itemId },
        ]}
        actionButtons={
          <DetailPageNav
            currentId={itemId}
            path={(id) =>
              `/project/${projectId}/datasets/${datasetId}/items/${id}`
            }
            listKey="datasetItems"
          />
        }
      />
      <EditDatasetItem
        projectId={projectId}
        datasetId={datasetId}
        itemId={itemId}
      />
      <Header title="Runs" level="h3" />
      <DatasetRunItemsTable
        projectId={projectId}
        datasetItemId={itemId}
        datasetId={datasetId}
      />
    </div>
  );
}
