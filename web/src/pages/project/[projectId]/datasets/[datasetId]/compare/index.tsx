import { Button } from "@/src/components/ui/button";
import { DatasetCompareRunsTable } from "@/src/features/datasets/components/DatasetCompareRunsTable";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { FlaskConical, List } from "lucide-react";
import { useRouter } from "next/router";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import {
  DATASET_RUN_COMPARE_TABS,
  getDatasetRunCompareTabs,
} from "@/src/features/navigation/utils/dataset-run-compare-tabs";
import { useDatasetRunsCompare } from "@/src/features/datasets/hooks/useDatasetRunsCompare";
import {
  ScoreWriteCacheProvider,
  useScoreWriteCache,
} from "@/src/features/datasets/contexts/ScoreWriteCache";
import {
  ActiveCellProvider,
  useActiveCell,
} from "@/src/features/datasets/contexts/ActiveCellContext";
import { SidePanel, SidePanelContent } from "@/src/components/ui/side-panel";

function DatasetCompareInternal() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;

  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [isAnnotationPanelOpen, setIsAnnotationPanelOpen] = useState(false);

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const {
    runIds,
    runs,
    dataset,
    runsData,
    localRuns,
    handleExperimentSettled: handleExperimentSettledBase,
    setRunState,
    setLocalRuns,
  } = useDatasetRunsCompare(projectId, datasetId);

  const { activeCell, clearActiveCell } = useActiveCell();
  const { clearWrites } = useScoreWriteCache();

  const handleExperimentSettled = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    await handleExperimentSettledBase(data);
  };

  // Clear annotation state on URL change (filters, navigation, etc.)
  useEffect(() => {
    clearActiveCell();
    clearWrites();
  }, [router.asPath, clearActiveCell, clearWrites]);

  // Open panel when cell becomes active, close when cleared
  useEffect(() => {
    setIsAnnotationPanelOpen(!!activeCell);
  }, [activeCell]);

  // Clear active cell when panel manually closed
  const handlePanelOpenChange = (open: boolean) => {
    if (!open) {
      clearActiveCell();
    }
    setIsAnnotationPanelOpen(open);
  };

  if (!runsData.data || runs.length === 0) {
    return <span>Loading...</span>;
  }

  return (
    <Page
      headerProps={{
        title: `Compare runs: ${dataset.data?.name ?? datasetId}`,
        breadcrumb: [
          {
            name: "Datasets",
            href: `/project/${projectId}/datasets`,
          },
          {
            name: dataset.data?.name ?? datasetId,
            href: `/project/${projectId}/datasets/${datasetId}`,
          },
        ],
        help: {
          description: "Compare your dataset runs side by side",
        },
        tabsProps: {
          tabs: getDatasetRunCompareTabs(projectId, datasetId),
          activeTab: DATASET_RUN_COMPARE_TABS.COMPARE,
        },
        actionButtonsRight: (
          <>
            <Dialog
              key="create-experiment-dialog"
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  variant="outline"
                  disabled={!hasExperimentWriteAccess}
                  onClick={() => capture("dataset_run:new_form_open")}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="ml-2 hidden md:block">New dataset run</span>
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
            </Dialog>
            <MultiSelectKeyValues
              key="select-runs"
              title="Runs"
              showSelectedValueStrings={false}
              placeholder="Select runs to compare"
              className="w-fit"
              variant="outline"
              hideClearButton
              iconLeft={<List className="mr-2 h-4 w-4" />}
              options={runs.map((run) => ({
                key: run.key,
                value: run.value,
                disabled: runIds?.includes(run.key) && runIds.length === 1,
              }))}
              values={runs.filter((run) => runIds?.includes(run.key))}
              onValueChange={(values, changedValueId, selectedValueKeys) => {
                if (values.length === 0) return;
                if (changedValueId) {
                  if (selectedValueKeys?.has(changedValueId)) {
                    capture("dataset_run:compare_run_added");
                    setRunState({
                      runs: [...(runIds ?? []), changedValueId],
                    });
                    setLocalRuns([]);
                  } else {
                    capture("dataset_run:compare_run_removed");
                    setRunState({
                      runs: runIds?.filter((id) => id !== changedValueId) ?? [],
                    });
                    setLocalRuns([]);
                  }
                }
              }}
            />
          </>
        ),
      }}
    >
      <div className="grid flex-1 grid-cols-[1fr,auto] overflow-hidden">
        <div className="flex h-full flex-col overflow-hidden">
          <DatasetCompareRunsTable
            key={runIds?.join(",") ?? "empty"}
            projectId={projectId}
            datasetId={datasetId}
            runIds={runIds ?? []}
            localExperiments={localRuns}
          />
        </div>
        <SidePanel
          id="annotation-panel"
          open={isAnnotationPanelOpen}
          onOpenChange={handlePanelOpenChange}
          mobileTitle="Annotate"
        >
          <SidePanelContent>
            <div className="p-4">
              <div className="text-sm font-medium">Mock annotation content</div>
              {activeCell && (
                <div className="mt-2 text-xs text-muted-foreground">
                  <div>Trace: {activeCell.traceId}</div>
                  {activeCell.observationId && (
                    <div>Observation: {activeCell.observationId}</div>
                  )}
                </div>
              )}
            </div>
          </SidePanelContent>
        </SidePanel>
      </div>
    </Page>
  );
}

export default function DatasetCompare() {
  return (
    <ScoreWriteCacheProvider>
      <ActiveCellProvider>
        <DatasetCompareInternal />
      </ActiveCellProvider>
    </ScoreWriteCacheProvider>
  );
}
