import Header from "@/src/components/layouts/header";
import { DatasetRunsTable } from "@/src/features/datasets/components/DatasetRunsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteButton } from "@/src/components/deleteButton";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const utils = api.useUtils();

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  return (
    <div>
      <Header
        title={dataset.data?.name ?? ""}
        breadcrumb={[
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          { name: dataset.data?.name ?? datasetId },
        ]}
        help={
          dataset.data?.description
            ? {
                description: dataset.data.description,
              }
            : undefined
        }
        actionButtons={
          <>
            <DetailPageNav
              currentId={datasetId}
              path={(id) => `/project/${projectId}/datasets/${id}`}
              listKey="datasets"
            />
            <DatasetActionButton
              mode="update"
              projectId={projectId}
              datasetId={datasetId}
              datasetName={dataset.data?.name ?? ""}
              datasetDescription={dataset.data?.description ?? undefined}
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
      <Tabs value="runs" className="mb-3">
        <TabsList>
          <TabsTrigger value="runs">Runs</TabsTrigger>
          <TabsTrigger value="items" asChild>
            <Link href={`/project/${projectId}/datasets/${datasetId}/items`}>
              Items
            </Link>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      <DatasetRunsTable projectId={projectId} datasetId={datasetId} />

      <p className="mt-3 text-xs text-gray-600">
        Add new runs via Python or JS/TS SDKs. See{" "}
        <a href="https://langfuse.com/docs/datasets" className="underline">
          documentation
        </a>{" "}
        for details.
      </p>
    </div>
  );
}
