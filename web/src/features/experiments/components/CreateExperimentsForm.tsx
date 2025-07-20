import React, { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Code2, Wand2, Cog } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/src/components/ui/card";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/src/components/ui/dialog";
import Link from "next/link";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { type CreateExperiment } from "@/src/features/experiments/types";
import { PromptExperimentsForm } from "@/src/features/experiments/components/PromptExperimentsForm";
import { WebhookUpsertForm } from "@/src/features/experiments/components/WebhookUpsertForm";
import { WebhookTriggerModal } from "@/src/features/experiments/components/WebhookTriggerModal";

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
  defaultValues?: Partial<CreateExperiment>;
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
  const [showWebhookUpsertForm, setShowWebhookUpsertForm] = useState(false);
  const [showWebhookTriggerModal, setShowWebhookTriggerModal] = useState(false);

  const hasExperimentWriteAccess = useHasProjectAccess({
    projectId,
    scope: "promptExperiments:CUD",
  });

  const datasetId = defaultValues.datasetId;

  const existingWebhook = api.datasets.getWebhook.useQuery(
    {
      projectId,
      datasetId: datasetId as string,
    },
    {
      enabled: !!datasetId,
    },
  );

  const runWebhookMutation = api.datasets.triggerWebhook.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        showSuccessToast({
          title: "Experiment started",
          description: "Your experiment may take a few minutes to complete.",
        });
      } else {
        showErrorToast(
          "Failed to start experiment",
          "Please try again or check your webhook configuration.",
        );
      }
    },
    onError: (error) => {
      showErrorToast(
        error.message || "Failed to start experiment",
        "Please try again or check your webhook configuration.",
      );
    },
  });

  if (!hasExperimentWriteAccess) {
    return null;
  }

  if (
    showSDKRunInfoPage &&
    !showPromptForm &&
    !showWebhookUpsertForm &&
    !showWebhookTriggerModal
  ) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Run Experiment on Dataset</DialogTitle>
          <DialogDescription>
            Experiments allow to test iterations of your application or prompt
            on a dataset. Learn more about datasets and experiments{" "}
            <Link
              href="https://langfuse.com/docs/datasets/overview"
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
            <div className="flex flex-1 flex-col gap-1">
              <Card className="flex flex-1 flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Wand2 className="size-4" />
                    Prompt Experiment
                  </CardTitle>
                  <CardDescription>
                    Test single prompts and model configurations via Langfuse UI
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
                    Create
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    asChild
                    onClick={() =>
                      capture("dataset_run:view_prompt_experiment_docs")
                    }
                  >
                    <Link href="https://langfuse.com/docs/datasets/prompt-experiments">
                      View Docs
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
              {!existingWebhook.data && <div className="h-6 w-full" />}
            </div>

            <div className="flex flex-1 flex-col gap-1">
              <Card className="flex flex-1 flex-col">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Code2 className="size-4" />
                    Custom Experiment
                  </CardTitle>
                  <CardDescription>
                    Run any experiment via the Langfuse SDKs
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ul className="list-disc space-y-2 pl-4 text-sm text-muted-foreground">
                    <li>Full control over experiment execution</li>
                    <li>Custom evaluation logic</li>
                    <li>Integration with your codebase</li>
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto flex flex-row gap-2">
                  {!!existingWebhook.data && datasetId && (
                    <div className="flex items-start">
                      <Button
                        className="rounded-r-none"
                        onClick={() => setShowWebhookTriggerModal(true)}
                      >
                        Run
                      </Button>
                      <Button
                        className="rounded-l-none rounded-r-md border-l-2 px-2"
                        onClick={() => setShowWebhookUpsertForm(true)}
                      >
                        <span className="relative mr-1 text-xs">
                          <Cog className="h-3 w-3" />
                        </span>
                      </Button>
                    </div>
                  )}
                  <Button
                    className="w-full"
                    variant="outline"
                    asChild
                    onClick={() =>
                      capture("dataset_run:view_custom_experiment_docs")
                    }
                  >
                    <Link
                      href="https://langfuse.com/docs/datasets/get-started"
                      target="_blank"
                    >
                      View Docs
                    </Link>
                  </Button>
                </CardFooter>
              </Card>
              {!existingWebhook.data && (
                <Button
                  className="w-full text-sm font-normal"
                  variant="link"
                  size="sm"
                  onClick={() => setShowWebhookUpsertForm(true)}
                >
                  Have a webhook? Set it up
                </Button>
              )}
            </div>
          </div>
        </DialogBody>
      </>
    );
  }

  if (showWebhookTriggerModal && datasetId) {
    return (
      <WebhookTriggerModal
        projectId={projectId}
        datasetId={datasetId}
        setShowTriggerModal={setShowWebhookTriggerModal}
      />
    );
  }

  if (showWebhookUpsertForm && datasetId) {
    return (
      <WebhookUpsertForm
        projectId={projectId}
        datasetId={datasetId}
        existingWebhook={existingWebhook.data}
        setShowWebhookUpsertForm={setShowWebhookUpsertForm}
      />
    );
  }

  return (
    <PromptExperimentsForm
      projectId={projectId}
      setFormOpen={setFormOpen}
      defaultValues={defaultValues}
      promptDefault={promptDefault}
      handleExperimentSettled={handleExperimentSettled}
      handleExperimentSuccess={handleExperimentSuccess}
      setShowPromptForm={setShowPromptForm}
      showSDKRunInfoPage={showSDKRunInfoPage}
    />
  );
};
