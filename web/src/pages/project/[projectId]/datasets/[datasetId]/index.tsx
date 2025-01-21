import Header from "@/src/components/layouts/header";
import { DatasetRunsTable } from "@/src/features/datasets/components/DatasetRunsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteButton } from "@/src/components/deleteButton";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { useState } from "react";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { ExternalLink, FlaskConical, FolderKanban } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useMemo } from "react";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import {
  Dialog,
  DialogContent,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { DropdownMenuItem } from "@/src/components/ui/dropdown-menu";
import { DatasetAnalytics } from "@/src/features/datasets/components/DatasetAnalytics";
import { RESOURCE_METRICS } from "@/src/features/dashboard/lib/score-analytics-utils";
import { MarkdownOrJsonView } from "@/src/components/trace/IOPreview";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function Dataset() {
  const router = useRouter();
  const capture = usePostHogClientCapture();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const utils = api.useUtils();
  const hasEntitlement = useHasEntitlement("model-based-evaluations");
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(
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

  const evaluators = api.evals.jobConfigsByDatasetId.useQuery(
    {
      projectId,
      datasetId,
    },
    {
      enabled: hasReadAccess && hasEntitlement && dataset.isSuccess,
    },
  );

  const evaluatorsOptions = useMemo(() => {
    if (!evaluators.data) return [];
    return evaluators.data?.map((evaluator) => ({
      key: evaluator.id,
      value: evaluator.scoreName,
    }));
  }, [evaluators.data]);

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
        href: `/project/${projectId}/datasets/${data.datasetId}/compare?runIds=${data.runId}`,
      },
    });
  };

  return (
    <FullScreenPage>
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
            <Dialog
              open={isCreateExperimentDialogOpen}
              onOpenChange={setIsCreateExperimentDialogOpen}
            >
              <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                <Button
                  variant="secondary"
                  disabled={!hasExperimentWriteAccess}
                  onClick={() => capture("dataset_run:new_form_open")}
                >
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
                  handleExperimentSuccess={handleExperimentSuccess}
                  showSDKRunInfoPage
                />
              </DialogContent>
            </Dialog>

            <DatasetAnalytics
              key="dataset-analytics"
              projectId={projectId}
              scoreOptions={scoreOptions}
              selectedMetrics={selectedMetrics}
              setSelectedMetrics={setSelectedMetrics}
            />

            {hasReadAccess && hasEntitlement && evaluators.isSuccess && (
              <MultiSelectKeyValues
                className="max-w-fit"
                placeholder="Search..."
                title="Evaluators"
                hideClearButton
                onValueChange={(_values, changedValue) => {
                  if (changedValue)
                    window.open(
                      `/project/${projectId}/evals/${changedValue}`,
                      "_blank",
                    );
                }}
                values={evaluatorsOptions}
                options={evaluatorsOptions}
                controlButtons={
                  <DropdownMenuItem
                    onSelect={() => {
                      window.open(`/project/${projectId}/evals`, "_blank");
                    }}
                  >
                    Manage evaluators
                    <ExternalLink className="ml-auto h-4 w-4" />
                  </DropdownMenuItem>
                }
              />
            )}
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
            </Popover>
            <DetailPageNav
              currentId={datasetId}
              path={(entry) => `/project/${projectId}/datasets/${entry.id}`}
              listKey="datasets"
            />
            <DatasetActionButton
              mode="update"
              projectId={projectId}
              datasetId={datasetId}
              datasetName={dataset.data?.name ?? ""}
              datasetDescription={dataset.data?.description ?? undefined}
              datasetMetadata={dataset.data?.metadata}
              icon
            />
            <DuplicateDatasetButton
              datasetId={datasetId}
              projectId={projectId}
            />
            <DeleteButton
              itemId={datasetId}
              projectId={projectId}
              isTableAction={false}
              scope="datasets:CUD"
              invalidateFunc={() => void utils.datasets.invalidate()}
              type="dataset"
              redirectUrl={`/project/${projectId}/datasets`}
              deleteConfirmation={dataset.data?.name}
            />
          </>
        }
      />

      <DatasetRunsTable
        projectId={projectId}
        datasetId={datasetId}
        selectedMetrics={selectedMetrics}
        setScoreOptions={setScoreOptions}
        menuItems={
          <Tabs value="runs">
            <TabsList>
              <TabsTrigger value="runs">Runs</TabsTrigger>
              <TabsTrigger value="items" asChild>
                <Link
                  href={`/project/${projectId}/datasets/${datasetId}/items`}
                >
                  Items
                </Link>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />
    </FullScreenPage>
  );
}
