import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { useRouter } from "next/router";

export default function DatasetCompare() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runIds = router.query.runs as undefined | string[];

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
            name: "Test dataset",
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ]}
      />
      <DatasetCompareRunsTable
        projectId={projectId}
        datasetId={datasetId}
        runIds={runIds}
      />
    </FullScreenPage>
  );
}
