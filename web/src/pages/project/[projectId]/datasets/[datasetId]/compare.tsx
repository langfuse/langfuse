import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";

export default function DatasetCompare() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runIds = router.query.runs as undefined | string[];

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  return (
    <FullScreenPage>
      <Header
        title="Compare Runs"
        breadcrumb={[
          {
            name: "Datasets",
            href: `/project/${projectId}/datasets`,
          },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ]}
        help={{
          description: "Compare your dataset runs side by side",
        }}
      />
      <DatasetCompareRunsTable
        projectId={projectId}
        datasetId={datasetId}
        runIds={runIds}
      />
    </FullScreenPage>
  );
}
