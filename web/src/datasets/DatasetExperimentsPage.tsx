import { DatasetRunsTable } from "@/src/datasets/components/DatasetRunsTable";
import { api } from "@/src/app/utils/api";
import { DetailPageNav } from "@/src/app/shell/navigate-detail-pages";
import { useState, useCallback } from "react";
import { FlaskConical, MoreVertical } from "lucide-react";
import { useHasProjectAccess } from "@/src/identity/access-control";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/app/design-system/legacy-primitives/dialog";
import { Button } from "@/src/app/design-system/legacy-primitives/button";
import {
  CreateExperimentsForm,
  useEvaluatorDefaults,
  useExperimentEvaluatorData,
  useExperimentAccess,
  singleRunToExperimentsUrl,
} from "@/src/experiments";
import { showSuccessToast } from "@/src/app/shell/notifications";
import { DatasetAnalytics } from "@/src/datasets/components/DatasetAnalytics";
import { RESOURCE_METRICS } from "@/src/analytics/dashboards";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import Page from "@/src/app/shell/layouts/page";
import { getDatasetTabs, DATASET_TABS } from "@/src/app/shell/navigation";
import { TemplateSelector } from "@/src/evaluators/components/template-selector";
import {
  EvaluatorForm,
  useEvaluatorFormTemplate,
} from "@/src/evaluators/components/evaluator-form";
import useLocalStorage from "@/src/app/components/useLocalStorage";
import { getDatasetBreadcrumb } from "@/src/datasets/utils/getDatasetBreadcrumb";
import { ExperimentsTable } from "@/src/experiments/components/table";
import { Skeleton } from "@/src/app/design-system/legacy-primitives/skeleton";
import {
  RouteParamsPendingFallback,
  useReadyRouteParams,
} from "@/src/app/hooks/useReadyRouteParams";
import { DatasetActionMenu } from "@/src/datasets/components/DatasetActionMenu";

export default function DatasetExperimentsPage() {
  const route = useReadyRouteParams(["projectId", "datasetId"]);
  if (!route.ready) return <RouteParamsPendingFallback />;
  return (
    <DatasetExperimentsView
      projectId={route.params.projectId}
      datasetId={route.params.datasetId}
    />
  );
}

function DatasetExperimentsView({
  projectId,
  datasetId,
}: {
  projectId: string;
  datasetId: string;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [selectedMetrics, setSelectedMetrics] = useLocalStorage<string[]>(
    `${projectId}-${datasetId}-chart-metrics`,
    RESOURCE_METRICS.map((metric) => metric.key),
  );

  const [scoreOptions, setScoreOptions] = useState<
    {
      key: string;
      value: string;
    }[]
  >([]);

  const dataset = api.datasets.byId.useQuery(
    {
      datasetId,
      projectId,
    },
    { enabled: Boolean(projectId) && Boolean(datasetId) },
  );

  const hasReadAccess = useHasProjectAccess({
    projectId,
    scope: "evalJobExecution:read",
  });

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });
  const { isExperimentsBetaActive, isInitializing } = useExperimentAccess();

  const handleExperimentSuccess = async (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => {
    setIsCreateExperimentDialogOpen(false);
    if (!data) return;

    if (isExperimentsBetaActive) {
      utils.experiments.all.invalidate();
      utils.experiments.countAll.invalidate();
      // The empty-window fallback is its own query, and a new run belongs in
      // it: without this it keeps serving its cached list.
      utils.experiments.mostRecent.invalidate();
    } else {
      utils.datasets.runsByDatasetId.invalidate();
      utils.datasets.baseRunDataByDatasetId.invalidate();
    }

    showSuccessToast({
      operation: "experiment.trigger",
      title: "Experiment triggered successfully",
      description: "Waiting for experiment to complete...",
      link: {
        text: "View experiment",
        href: isExperimentsBetaActive
          ? singleRunToExperimentsUrl(projectId, data.runId)
          : `/project/${projectId}/datasets/${data.datasetId}/compare?runs=${data.runId}`,
      },
    });
  };

  const hasEvaluationRuleReadAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:read",
  });

  const hasEvaluationRuleWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evaluationRule:CUD",
  });

  const hasEvaluatorReadAccess = useHasProjectAccess({
    projectId,
    scope: "evaluator:read",
  });

  const evalTemplates = api.evals.latestTemplates.useQuery(
    { projectId },
    {
      enabled:
        !isExperimentsBetaActive &&
        hasEvaluatorReadAccess &&
        Boolean(projectId),
    },
  );

  const evaluators = api.evals.jobConfigsByTarget.useQuery(
    { projectId, targetObject: ["dataset", "experiment"] },
    {
      enabled:
        !isExperimentsBetaActive && hasEvaluationRuleReadAccess && !!datasetId,
    },
  );

  const { createDefaultEvaluator } = useEvaluatorDefaults();

  const {
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
  const evalTemplate = useEvaluatorFormTemplate({
    evalTemplates: evalTemplates.data?.templates ?? [],
    evalTemplate: selectedEvaluatorData?.evaluator.evalTemplate,
    templateId: selectedEvaluatorData?.templateId,
  });
  // Callback for preprocessing evaluator form values
  // For experiment evaluators, we only run on new data (not historic)
  const preprocessFormValues = useCallback((values: any) => values, []);

  const breadcrumb = getDatasetBreadcrumb(
    projectId,
    datasetId,
    dataset.data?.name,
  );

  if (isInitializing) {
    return <Skeleton className="h-full w-full" />;
  }

  if (isExperimentsBetaActive) {
    return (
      <Page
        headerProps={{
          title: dataset.data?.name ?? "",
          itemType: "DATASET",
          breadcrumb,
          tabsProps: {
            tabs: getDatasetTabs(projectId, datasetId),
            activeTab: DATASET_TABS.EXPERIMENTS,
          },
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
                    <FlaskConical className="icon-base text-icon-foreground" />
                    <span className="ml-2 hidden md:block">Run experiment</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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
            </>
          ),
        }}
      >
        <ExperimentsTable
          projectId={projectId}
          fixedFilter={[
            {
              column: "experimentDatasetId",
              type: "stringOptions",
              operator: "any of",
              value: [datasetId],
            },
          ]}
          sessionFilterContextId={`dataset-${datasetId}`}
          showControlsInPageHeader
        />
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: dataset.data?.name ?? "",
        itemType: "DATASET",
        breadcrumb,
        help: dataset.data?.description
          ? {
              description: dataset.data.description,
            }
          : undefined,
        tabsProps: {
          tabs: getDatasetTabs(projectId, datasetId),
          activeTab: DATASET_TABS.EXPERIMENTS,
        },
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
                  <FlaskConical className="icon-base text-icon-foreground" />
                  <span className="ml-2 hidden md:block">Run experiment</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
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

            {hasEvaluationRuleReadAccess && hasEvaluatorReadAccess ? (
              <div className="w-fit">
                <TemplateSelector
                  projectId={projectId}
                  datasetId={datasetId}
                  evalTemplates={evalTemplates.data?.templates ?? []}
                  onConfigureTemplate={handleConfigureEvaluator}
                  onSelectEvaluator={handleSelectEvaluator}
                  disabled={!hasEvaluationRuleWriteAccess}
                />
              </div>
            ) : null}

            <DatasetAnalytics
              key="dataset-analytics"
              scoreOptions={scoreOptions}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
            />

            <DetailPageNav
              currentId={datasetId}
              path={(entry) =>
                `/project/${projectId}/datasets/${entry.id}/experiments`
              }
              listKey="datasets"
            />
            <DatasetActionMenu
              projectId={projectId}
              datasetId={datasetId}
              datasetName={dataset.data?.name ?? ""}
              datasetDescription={dataset.data?.description ?? undefined}
              datasetMetadata={dataset.data?.metadata}
              datasetInputSchema={dataset.data?.inputSchema ?? undefined}
              datasetExpectedOutputSchema={
                dataset.data?.expectedOutputSchema ?? undefined
              }
              manageEvaluatorsHref={
                hasReadAccess
                  ? `/project/${projectId}/evals?target=dataset`
                  : undefined
              }
            >
              {({ getTriggerProps }) => (
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Dataset actions"
                  {...getTriggerProps()}
                >
                  <MoreVertical className="icon-base text-icon-foreground" />
                </Button>
              )}
            </DatasetActionMenu>
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
      {selectedEvaluatorData && evalTemplate && (
        <Dialog
          open={showEvaluatorForm}
          onOpenChange={(open) => {
            if (!open) {
              handleCloseEvaluatorForm();
            }
          }}
        >
          <DialogContent className="max-h-[90vh] max-w-(--breakpoint-md) overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {selectedEvaluatorData.evaluator.id ? "Edit" : "Configure"}{" "}
                Evaluator
              </DialogTitle>
            </DialogHeader>
            <EvaluatorForm
              useDialog={true}
              projectId={projectId}
              evalTemplate={evalTemplate}
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
