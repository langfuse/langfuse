import Header from "@/src/components/layouts/header";
import { DatasetRunsTable } from "@/src/features/datasets/components/DatasetRunsTable";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import Link from "next/link";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { DatasetActionButton } from "@/src/features/datasets/components/DatasetActionButton";
import { DeleteButton } from "@/src/components/deleteButton";
import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { FullScreenPage } from "@/src/components/layouts/full-screen-page";
import { DuplicateDatasetButton } from "@/src/features/datasets/components/DuplicateDatasetButton";
import { useState } from "react";
import { MultiSelectKeyValues } from "@/src/features/scores/components/multi-select-key-values";
import { CommandItem } from "@/src/components/ui/command";
import { ExternalLink, FlaskConical } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useMemo } from "react";
import { useHasOrgEntitlement } from "@/src/features/entitlements/hooks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { CreateExperimentsForm } from "@/src/ee/features/experiments/components/CreateExperimentsForm";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

export default function Dataset() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const datasetId = router.query.datasetId as string;
  const utils = api.useUtils();
  const hasEntitlement = useHasOrgEntitlement("model-based-evaluations");
  const hasExperimentEntitlement = useHasOrgEntitlement("experiments");
  const [isCreateExperimentDialogOpen, setIsCreateExperimentDialogOpen] =
    useState(false);

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
    scope: "experiments:CUD",
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
            {hasExperimentEntitlement && (
              <Dialog
                open={isCreateExperimentDialogOpen}
                onOpenChange={setIsCreateExperimentDialogOpen}
              >
                <DialogTrigger asChild disabled={!hasExperimentWriteAccess}>
                  <Button
                    variant="secondary"
                    disabled={!hasExperimentWriteAccess}
                  >
                    <FlaskConical className="h-4 w-4" />
                    <span className="ml-2">New experiment</span>
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Set up experiment</DialogTitle>
                    <DialogDescription>
                      Create an experiment to test a prompt version on a
                      dataset. See{" "}
                      <Link
                        href="https://langfuse.com/docs/datasets/prompt-experiments"
                        target="_blank"
                        className="underline"
                      >
                        documentation
                      </Link>{" "}
                      to learn more.
                    </DialogDescription>
                  </DialogHeader>
                  <CreateExperimentsForm
                    key={`create-experiment-form-${datasetId}`}
                    projectId={projectId as string}
                    setFormOpen={setIsCreateExperimentDialogOpen}
                    defaultValues={{
                      datasetId,
                    }}
                    handleExperimentSuccess={handleExperimentSuccess}
                  />
                </DialogContent>
              </Dialog>
            )}

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
                  <CommandItem
                    onSelect={() => {
                      window.open(`/project/${projectId}/evals`, "_blank");
                    }}
                  >
                    Manage evaluators
                    <ExternalLink className="ml-auto h-4 w-4" />
                  </CommandItem>
                }
              />
            )}
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
      {!!dataset.data?.metadata && (
        <JSONView
          json={dataset?.data.metadata}
          title="Metadata"
          className="max-h-[25vh] overflow-y-auto"
        />
      )}

      <DatasetRunsTable
        projectId={projectId}
        datasetId={datasetId}
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

      <p className="mt-3 text-xs text-muted-foreground">
        Add new runs via Python or JS/TS SDKs. See{" "}
        <a href="https://langfuse.com/docs/datasets" className="underline">
          documentation
        </a>{" "}
        for details.
      </p>
    </FullScreenPage>
  );
}
