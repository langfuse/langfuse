import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";

export default function DatasetCompare() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const runIds = router.query.runs as undefined | string[];

  const [runState, setRunState] = useQueryParams({
    runs: withDefault(ArrayParam, []),
  });

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const runIdsAndNames = api.datasets.runNamesByDatasetId.useQuery({
    projectId,
    datasetId,
  });

  const runs = useMemo(() => {
    return (
      runIdsAndNames.data?.map((run) => ({
        key: run.id,
        value: run.name,
      })) ?? []
    );
  }, [runIdsAndNames.data]);

  if (!runIdsAndNames.data || !router.isReady) {
    return <span>Loading...</span>;
  }

  return (
    <FullScreenPage key={runIds?.join(",") ?? "empty"}>
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
        actionButtons={
          <MultiSelectKeyValues
            title="Select Runs"
            emptyPlaceholder="Select runs to compare"
            options={runs.map((run) => ({
              key: run.key,
              value: run.value,
              disabled: runIds?.includes(run.key) && runIds.length === 2,
            }))}
            values={runs.filter((run) => runIds?.includes(run.key))}
            onValueChange={(values, changedValueId, selectedValueKeys) => {
              if (values.length === 0)
                setRunState({
                  runs: [],
                });
              if (changedValueId) {
                if (selectedValueKeys?.has(changedValueId)) {
                  setRunState({
                    runs: [...(runIds ?? []), changedValueId],
                  });
                } else {
                  setRunState({
                    runs: runIds?.filter((id) => id !== changedValueId) ?? [],
                  });
                }
              }
            }}
          />
        }
      />
      <DatasetCompareRunsTable
        projectId={projectId}
        datasetId={datasetId}
        runIdsAndNames={runIdsAndNames.data}
        runIds={runIds ?? []}
      />
    </FullScreenPage>
  );
}
