import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { api } from "@/src/utils/api";
import { FolderKanban } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { MarkdownOrJsonView } from "@/src/components/trace/IOPreview";

export default function DatasetCompare() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const [runState, setRunState] = useQueryParams({
    runs: withDefault(ArrayParam, []),
  });
  const runIds = runState.runs as undefined | string[];

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const runsData = api.datasets.baseRunDataByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      enabled: !!dataset.data,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
    },
  );

  const runs = useMemo(() => {
    return (
      runsData.data?.map((run) => ({
        key: run.id,
        value: run.name,
      })) ?? []
    );
  }, [runsData.data]);

  if (!runsData.data || !router.isReady) {
    return <span>Loading...</span>;
  }

  return (
    <FullScreenPage key={runIds?.join(",") ?? "empty"}>
      <Header
        title={`Compare runs: ${dataset.data?.name ?? datasetId}`}
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
        actionButtons={[
          <Popover key="show-dataset-details">
            <PopoverTrigger asChild>
              <Button variant="outline">
                <FolderKanban className="mr-2 h-4 w-4" />
                Dataset details
              </Button>
            </PopoverTrigger>
            <PopoverContent className="mx-2 max-h-[50vh] w-[50vw] overflow-y-auto md:w-[25vw]">
              <div className="space-y-4">
                <div>
                  <h4 className="mb-1 font-medium">Description</h4>
                  <span className="text-sm text-muted-foreground">
                    {dataset.data?.description ?? "No description"}
                  </span>
                </div>
                <div>
                  <h4 className="mb-1 font-medium">Metadata</h4>
                  <MarkdownOrJsonView
                    content={dataset.data?.metadata ?? null}
                  />
                </div>
              </div>
            </PopoverContent>
          </Popover>,
          <MultiSelectKeyValues
            key="select-runs"
            title="Select runs"
            placeholder="Select runs to compare"
            className="w-fit"
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
          />,
        ]}
      />
      <DatasetCompareRunsTable
        projectId={projectId}
        datasetId={datasetId}
        runsData={runsData.data}
        runIds={runIds ?? []}
      />
    </FullScreenPage>
  );
}
