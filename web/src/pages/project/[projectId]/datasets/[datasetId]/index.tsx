import { DatasetRunsTable } from "@/src/features/datasets/components/DatasetRunsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import Link from "next/link";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/src/components/ui/dropdown-menu";
import { DeleteDatasetButton } from "@/src/components/deleteButton";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { useState, useCallback } from "react";
import { Bot, FlaskConical, MoreVertical } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { CreateExperimentsForm } from "@/src/features/experiments/components/CreateExperimentsForm";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { RESOURCE_METRICS } from "@/src/features/dashboard/lib/score-analytics-utils";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import {
  TabsBarList,
  TabsBarTrigger,
  TabsBar,
} from "@/src/components/ui/tabs-bar";
import { TemplateSelector } from "@/src/features/evals/components/template-selector";
import { useEvaluatorDefaults } from "@/src/features/experiments/hooks/useEvaluatorDefaults";
import { useExperimentEvaluatorData } from "@/src/features/experiments/hooks/useExperimentEvaluatorData";
import { EvaluatorForm } from "@/src/features/evals/components/evaluator-form";
import useLocalStorage from "@/src/components/useLocalStorage";

export default function Dataset() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const utils = api.useUtils();
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [selectedMetrics, setSelectedMetrics] = useLocalStorage<string[]>(
    `${projectId}-dataset-chart-metrics`,
    RESOURCE_METRICS.map((metric) => metric.key),
  );

  const [scoreOptions, setScoreOptions] = useState<
    {
      key: string;
      value: string;
    }[]
  >([]);

  const dataset = api.datasets.byId.useQuery({
    datasetId,
    projectId,
  });

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJobExecution:read",
  });

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const handleExperimentSuccess = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;
    void utils.datasets.runsByDatasetId.invalidate();
    void utils.datasets.baseRunDataByDatasetId.invalidate();
    showSuccessToast({
      title: "Experiment run triggered successfully",
      description: "Waiting for experiment to complete...",
      link: {
        text: "View experiment",
        href: `/project/${projectId}/datasets/${data.datasetId}/compare?runs=${data.runId}`,
      },
    });
  };

  const hasEvalReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:read",
  });

  const hasEvalWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalJob:CUD",
  });

  const evalTemplates = api.evals.allTemplates.useQuery({
    projectId,
  });

  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: "dataset" },
    {
      enabled: hasEvalReadAccess && !!datasetId,
    },
  );

  const { createDefaultEvaluator } = useEvaluatorDefaults();

  const {
    activeEvaluators,
    inActiveEvaluators,
    selectedEvaluatorData,
    showEvaluatorForm,
    handleConfigureEvaluator,
    handleCloseEvaluatorForm,
    handleEvaluatorSuccess,
    handleSelectEvaluator,
  } = useExperimentEvaluatorData({
    datasetId,
    createDefaultEvaluator,
    evaluatorsData: evaluators.data,
    evalTemplatesData: evalTemplates.data,
    refetchEvaluators: evaluators.refetch,
  });

  // This function will be passed to the EvaluatorForm to modify form values before submission
  const preprocessFormValues = useCallback((values: any) => {
    // Ask the user if they want to run on historic data
    const shouldRunOnHistoric = confirm(
      "Do you also want to execute this evaluator on historic data? If not, click cancel.",
    );

    // If the user confirms, include EXISTING in the timeScope
    if (shouldRunOnHistoric && !values.timeScope.includes("EXISTING")) {
      values.timeScope = [...values.timeScope, "EXISTING"];
    }

    return values;
  }, []);

  return (
    <Page
      headerProps={{
        title: dataset.data?.name ?? "",
        itemType: "DATASET",
        breadcrumb: [
          { name: "Datasets", href: `/project/${projectId}/datasets` },
        ],
        help: dataset.data?.description
          ? {
              description: dataset.data.description,
            }
          : undefined,
        tabsComponent: (
          <TabsBar value="runs">
            <TabsBarList>
              <TabsBarTrigger value="runs">Runs</TabsBarTrigger>
              <TabsBarTrigger value="items" asChild>
                <Link
                  href={`/project/${projectId}/datasets/${datasetId}/items`}
                >
                  Items
                </Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
          <>
            <Dialog
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  disabled={!hasExperimentWriteAccess}
                  onClick={() => capture("dataset_run:new_form_open")}
                >
                  <FlaskConical className="h-4 w-4" />
                  <span className="ml-2 hidden md:block">New experiment</span>
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
                  handleExperimentSuccess={handleExperimentSuccess}
                  showSDKRunInfoPage
                />
              </DialogContent>
            </Dialog>

            {hasEvalReadAccess && (
              <div className="w-fit">
                <TemplateSelector
                  projectId={projectId}
                  datasetId={datasetId}
                  evalTemplates={evalTemplates.data?.templates ?? []}
                  onConfigureTemplate={handleConfigureEvaluator}
                  onSelectEvaluator={handleSelectEvaluator}
                  activeTemplateIds={activeEvaluators}
                  inactiveTemplateIds={inActiveEvaluators}
                  disabled={!hasEvalWriteAccess}
                />
              </div>
            )}

            <DatasetAnalytics
              key="dataset-analytics"
              projectId={projectId}
              scoreOptions={scoreOptions}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
            />

            <DetailPageNav
              currentId={datasetId}
              path={(entry) => `/project/${projectId}/datasets/${entry.id}`}
              listKey="datasets"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="flex flex-col [&>*]:w-full [&>*]:justify-start">
                <DropdownMenuItem asChild>
                  <DatasetActionButton
                    mode="update"
                    projectId={projectId}
                    datasetId={datasetId}
                    datasetName={dataset.data?.name ?? ""}
                    datasetDescription={dataset.data?.description ?? undefined}
                    datasetMetadata={dataset.data?.metadata}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <DuplicateDatasetButton
                    datasetId={datasetId}
                    projectId={projectId}
                  />
                </DropdownMenuItem>
                <DropdownMenuItem
                  asChild
                  onSelect={(event) => {
                    event.preventDefault();
                    return false;
                  }}
                >
                  <DeleteDatasetButton
                    itemId={datasetId}
                    projectId={projectId}
                    redirectUrl={`/project/${projectId}/datasets`}
                    deleteConfirmation={dataset.data?.name}
                  />
                </DropdownMenuItem>
                {hasReadAccess && (
                  <DropdownMenuItem asChild>
                    <Link href={`/project/${projectId}/evals?target=dataset`}>
                      <Bot className="ml-1 mr-2 h-4 w-4" />
                      Manage Evaluators
                    </Link>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        ),
      }}
    >
      <DatasetRunsTable
        projectId={projectId}
        datasetId={datasetId}
        selectedMetrics={selectedMetrics}
        setScoreOptions={setScoreOptions}
      />
      {/* Dialog for configuring evaluators */}
      {selectedEvaluatorData && (
        <Dialog
          open={showEvaluatorForm}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEvaluatorForm();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-screen-md overflow-y-auto">
            <DialogTitle>
              {selectedEvaluatorData.evaluator.id ? "Edit" : "Configure"}{" "}
              Evaluator
            </DialogTitle>
            <EvaluatorForm
              useDialog={true}
              projectId={projectId}
              evalTemplates={evalTemplates.data?.templates ?? []}
              templateId={selectedEvaluatorData.templateId}
              existingEvaluator={selectedEvaluatorData.evaluator}
              mode={selectedEvaluatorData.evaluator.id ? "edit" : "create"}
              hideTargetSection={!selectedEvaluatorData.evaluator.id}
              onFormSuccess={handleEvaluatorSuccess}
              preprocessFormValues={preprocessFormValues}
            />
          </DialogContent>
        </Dialog>
      )}
    </Page>
  );
}
