import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import Header from "@/src/components/layouts/header";
import { Button } from "@/src/components/ui/button";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { api } from "@/src/utils/api";
import { FlaskConical, FolderKanban } from "lucide-react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { useQueryParams, withDefault, ArrayParam } from "use-query-params";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/src/components/ui/popover";
import { MarkdownOrJsonView } from "@/src/components/trace/IOPreview";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";

export default function DatasetCompare() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const [runState, setRunState] = useQueryParams({
    runs: withDefault(ArrayParam, []),
  });
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [localRuns, setLocalRuns] = useState<
    Array<{ key: string; value: string }>
  >([]);
  const runIds = runState.runs as undefined | string[];

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });
  const hasEntitlement = useHasEntitlement("prompt-experiments");

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
  const utils = api.useUtils();

  const handleExperimentSettled = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;
    void utils.datasets.baseRunDataByDatasetId.invalidate();
    setLocalRuns((prev) => [...prev, { key: data.runId, value: data.runName }]);
    setRunState({
      runs: [...(runIds ?? []), data.runId],
    });
  };

  const runs = useMemo(() => {
    const apiRuns =
      runsData.data?.map((run) => ({
        key: run.id,
        value: run.name,
      })) ?? [];

    return [...apiRuns, ...localRuns];
  }, [runsData.data, localRuns]);

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
          <Dialog
            key="create-experiment-dialog"
            open={isCreateExperimentDialogOpen}
            onOpenChange={setIsCreateExperimentDialogOpen}
          >
            <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
              <Button variant="secondary" disabled={!hasExperimentWriteAccess}>
                <FlaskConical className="h-4 w-4" />
                <span className="ml-2">New experiment</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <CreateExperimentsForm
                key={`create-experiment-form-${datasetId}`}
                projectId={projectId as string}
                setFormOpen={setIsCreateExperimentDialogOpen}
                defaultValues={{
                  datasetId,
                }}
                handleExperimentSettled={handleExperimentSettled}
                showSDKRunInfoPage
              />
            </DialogContent>
          </Dialog>,
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
            hideClearButton
            options={runs.map((run) => ({
              key: run.key,
              value: run.value,
              disabled: runIds?.includes(run.key) && runIds.length === 2,
            }))}
            values={runs.filter((run) => runIds?.includes(run.key))}
            onValueChange={(values, changedValueId, selectedValueKeys) => {
              if (values.length === 0) return;
              if (changedValueId) {
                if (selectedValueKeys?.has(changedValueId)) {
                  setRunState({
                    runs: [...(runIds ?? []), changedValueId],
                  });
                  setLocalRuns([]);
                } else {
                  setRunState({
                    runs: runIds?.filter((id) => id !== changedValueId) ?? [],
                  });
                  setLocalRuns([]);
                }
              }
            }}
          />,
        ]}
      />
      <DatasetCompareRunsTable
        key={runIds?.join(",") ?? "empty"}
        projectId={projectId}
        datasetId={datasetId}
        runsData={runsData.data}
        runIds={runIds ?? []}
        localExperiments={localRuns}
      />
    </FullScreenPage>
  );
}
