import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { DatasetRunItemsTable } from "@/src/features/datasets/components/DatasetRunItemsTable";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runId = router.query.runId as string;

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });
  const run = api.datasets.runById.useQuery({
    datasetId,
    projectId,
    runId,
  });

  return (
    <FullScreenPage>
      <Header
        title={`Dataset Run`}
        breadcrumb={[
          { name: "Datasets", href: `/project/${projectId}/datasets` },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
          { name: "Runs", href: `/project/${projectId}/datasets/${datasetId}` },
          { name: run.data?.name ?? "" },
        ]}
        actionButtons={
          <DetailPageNav
            currentId={runId}
            path={(id) =>
              `/project/${projectId}/datasets/${datasetId}/runs/${id}`
            }
            listKey="datasetRuns"
          />
        }
      />
      <div className="flex flex-col gap-2">
        {!!run.data?.description && (
          <JSONView json={run.data.description} title="Description" />
        )}
        {!!run.data?.metadata && (
          <JSONView json={run.data.metadata} title="Metadata" />
        )}
      </div>
      <DatasetRunItemsTable
        projectId={projectId}
        datasetId={datasetId}
        datasetRunId={runId}
      />
    </FullScreenPage>
  );
}
