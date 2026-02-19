import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Code2, Wand2, Cog, Zap } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/src/components/ui/card";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type CreateExperiment } from "@/src/features/experiments/types";
import { MultiStepExperimentForm } from "@/src/features/experiments/components/MultiStepExperimentForm";
import { RemoteExperimentUpsertForm } from "@/src/features/experiments/components/RemoteExperimentUpsertForm";
import { RemoteExperimentTriggerModal } from "@/src/features/experiments/components/RemoteExperimentTriggerModal";
import { Skeleton } from "@/src/components/ui/skeleton";

export const CreateExperimentsForm = ({
  projectId,
  setFormOpen,
  defaultValues = {},
  promptDefault,
  handleExperimentSettled,
  handleExperimentSuccess,
  showSDKRunInfoPage = false,
}: {
  projectId: string;
  setFormOpen: (open: boolean) => void;
  defaultValues?: Partial<Pick<CreateExperiment, "promptId" | "datasetId">>;
  promptDefault?: {
    name: string;
    version: number;
  };
  handleExperimentSuccess?: (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => Promise<void>;
  handleExperimentSettled?: (data?: {
    success: boolean;
    datasetId: string;
    runId: string;
    runName: string;
  }) => Promise<void>;
  showSDKRunInfoPage?: boolean;
}) => {
  const capture = usePostHogClientCapture();
  const [showPromptForm, setShowPromptForm] = useState(false);
  const [showRemoteExperimentUpsertForm, setShowRemoteExperimentUpsertForm] =
    useState(false);
  const [
    showRemoteExperimentTriggerModal,
    setShowRemoteExperimentTriggerModal,
  ] = useState(false);

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const datasetId = defaultValues.datasetId;

  const existingRemoteExperiment = api.datasets.getRemoteExperiment.useQuery(
    {
      projectId,
      datasetId: datasetId as string,
    },
    {
      enabled: !!datasetId,
    },
  );

  if (!hasExperimentWriteAccess) {
    return null;
  }

  if (existingRemoteExperiment.isLoading && !!datasetId) {
    return <Skeleton className="h-48 w-full" />;
  }

  if (
    showSDKRunInfoPage &&
    !showPromptForm &&
    !showRemoteExperimentUpsertForm &&
    !showRemoteExperimentTriggerModal
  ) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Run Experiment</DialogTitle>
          <DialogDescription>
            Experiments allow you to test iterations of your application or
            prompt on a dataset. Learn more about experiments{" "}
            <Link
              href="https://langfuse.com/docs/evaluation/dataset-runs/datasets"
              target="_blank"
              className="underline"
            >
              here
            </Link>
            .
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-8">
          <div className="mt-4 grid grid-cols-2 grid-rows-1 gap-2">
            <Card className="flex flex-1 flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Wand2 className="size-4" />
                  via User Interface
                </CardTitle>
                <CardDescription>
                  Test single prompts and model configurations via Langfuse UI.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                  <li>Compare prompt versions</li>
                  <li>Compare model configurations</li>
                  <li>No code required</li>
                </ul>
              </CardContent>
              <CardFooter className="mt-auto flex flex-row gap-2">
                <Button
                  className="w-full"
                  onClick={() => setShowPromptForm(true)}
                >
                  Configure
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  asChild
                  onClick={() =>
                    capture("dataset_run:view_prompt_experiment_docs")
                  }
                >
                  <Link href="https://langfuse.com/docs/evaluation/dataset-runs/native-run">
                    View Docs
                  </Link>
                </Button>
              </CardFooter>
            </Card>

            <Card className="flex flex-1 flex-col">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Code2 className="size-4" />
                  via SDK / API
                </CardTitle>
                <CardDescription>
                  Start any dataset run via the Langfuse SDKs. To configure runs
                  via webhook, use the button below.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                  <li>Full control over dataset run execution</li>
                  <li>Custom evaluation logic</li>
                  <li>Integration with your codebase</li>
                </ul>
              </CardContent>
              <CardFooter className="mt-auto flex flex-row gap-2">
                {!!existingRemoteExperiment.data && datasetId && (
                  <div className="flex items-start">
                    <Button
                      className="rounded-r-none"
                      onClick={() => setShowRemoteExperimentTriggerModal(true)}
                    >
                      Run
                    </Button>
                    <Button
                      className="rounded-l-none rounded-r-md border-l-2 px-2"
                      onClick={() => setShowRemoteExperimentUpsertForm(true)}
                    >
                      <span className="relative mr-1 text-xs">
                        <Cog className="h-3 w-3" />
                      </span>
                    </Button>
                  </div>
                )}
                <Button
                  className="flex-1"
                  variant="outline"
                  asChild
                  onClick={() =>
                    capture("dataset_run:view_custom_experiment_docs")
                  }
                >
                  <Link
                    href="https://langfuse.com/docs/evaluation/dataset-runs/remote-run"
                    target="_blank"
                  >
                    View Docs
                  </Link>
                </Button>
                {!existingRemoteExperiment.data && (
                  <Button
                    variant="outline"
                    title="Set up remote dataset run in UI trigger"
                    className="h-8 w-8 flex-shrink-0"
                    size="icon"
                    onClick={() => setShowRemoteExperimentUpsertForm(true)}
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                )}
              </CardFooter>
            </Card>
          </div>
        </DialogBody>
      </>
    );
  }

  if (
    showRemoteExperimentTriggerModal &&
    datasetId &&
    existingRemoteExperiment.data
  ) {
    return (
      <RemoteExperimentTriggerModal
        projectId={projectId}
        datasetId={datasetId}
        remoteExperimentConfig={existingRemoteExperiment.data}
        setShowTriggerModal={setShowRemoteExperimentTriggerModal}
      />
    );
  }

  if (showRemoteExperimentUpsertForm && datasetId) {
    return (
      <RemoteExperimentUpsertForm
        projectId={projectId}
        datasetId={datasetId}
        existingRemoteExperiment={existingRemoteExperiment.data}
        setShowRemoteExperimentUpsertForm={setShowRemoteExperimentUpsertForm}
      />
    );
  }

  return (
    <MultiStepExperimentForm
      projectId={projectId}
      setFormOpen={setFormOpen}
      defaultValues={defaultValues}
      promptDefault={promptDefault}
      handleExperimentSettled={handleExperimentSettled}
      handleExperimentSuccess={handleExperimentSuccess}
    />
  );
};
