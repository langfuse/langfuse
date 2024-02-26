import Header from "@/src/components/layouts/header";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { DatasetItemsTable } from "@/src/features/datasets/components/DatasetItemsTable";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";

export default function DatasetItems() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  return (
    <div>
      <Header
        title={`Dataset: ${dataset.data?.name}`}
        breadcrumb={[
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          { name: dataset.data?.name ?? datasetId },
        ]}
        actionButtons={
          <DetailPageNav
            currentId={datasetId}
            path={(id) => `/project/${projectId}/datasets/${id}/items/`}
            listKey="datasets"
          />
        }
      />
      <Tabs value="items" className="mb-3">
        <TabsList>
          <TabsTrigger value="runs" asChild>
            <Link href={`/project/${projectId}/datasets/${datasetId}`}>
              Runs
            </Link>
          </TabsTrigger>
          <TabsTrigger value="items">Items</TabsTrigger>
        </TabsList>
      </Tabs>

      <DatasetItemsTable projectId={projectId} datasetId={datasetId} />
    </div>
  );
}
