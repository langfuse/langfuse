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
import { useState } from "react";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import {
  ChartLine,
  Cog,
  ExternalLink,
  FlaskConical,
  MoreVertical,
} from "lucide-react";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import Page from "@/src/components/layouts/page";
import {
  TabsBarList,
  TabsBarTrigger,
  TabsBar,
} from "@/src/components/ui/tabs-bar";
import { Separator } from "@/src/components/ui/separator";

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
        href: `/project/${projectId}/datasets/${data.datasetId}/compare?runs=${data.runId}`,
      },
    });
  };

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
                  variant="outline"
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

            {hasReadAccess && hasEntitlement && evaluators.isSuccess && (
              <MultiSelectKeyValues
                variant="outline"
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

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  className="focus-visible:ring-0 focus-visible:ring-offset-0"
                >
                  <div className="relative" title="Chart settings">
                    <ChartLine className="h-4 w-4" />
                    <Cog className="absolute -bottom-1.5 -right-1 h-3.5 w-3.5 rounded-full bg-background p-0.5" />
                  </div>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-[250px] p-0">
                <div className="px-3 py-2 font-medium">Chart settings</div>
                <Separator />
                <div onClick={(e) => e.stopPropagation()} className="p-1">
                  <DatasetAnalytics
                    key="dataset-analytics"
                    projectId={projectId}
                    scoreOptions={scoreOptions}
                    selectedMetrics={selectedMetrics}
                    setSelectedMetrics={setSelectedMetrics}
                  />
                </div>
              </PopoverContent>
            </Popover>

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
                <DropdownMenuItem asChild>
                  <DeleteDatasetButton
                    itemId={datasetId}
                    projectId={projectId}
                    redirectUrl={`/project/${projectId}/datasets`}
                    deleteConfirmation={dataset.data?.name}
                  />
                </DropdownMenuItem>
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
    </Page>
  );
}
