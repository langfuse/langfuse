/* eslint-disable @repo/no-style-props, @repo/no-abstracted-overlay-trigger */
import { useHasProjectAccess } from "@/src/features/rbac";
import { ModelParameters } from "@/src/components/ModelParameters";
import { CardContent, Card } from "@/src/components/ui/card";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import { DeleteEvaluationModelButton } from "@/src/components/deleteButton";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { useState } from "react";
import {
  DialogContent,
  DialogTrigger,
  Dialog,
} from "@/src/components/ui/dialog";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { Pencil } from "lucide-react";
import { ConfirmationDialogController } from "@/src/components/design-system/ConfirmationDialogController/ConfirmationDialogController";

type DefaultEvalModelSuccessMessage = {
  title: string;
  description: string;
};

function useDefaultEvalModelSetup({
  projectId,
  onSuccess,
  successMessage,
}: {
  projectId: string;
  onSuccess?: () => void;
  successMessage: DefaultEvalModelSuccessMessage;
}) {
  const utils = api.useUtils();
  const [formError, setFormError] = useState<string | null>(null);

  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  const {
    modelParams,
    setModelParams,
    updateModelParamValue,
    setModelParamEnabled,
    availableModels,
    providerModelCombinations,
    availableProviders,
  } = useModelParams();

  const { selectedModel, isDefaultModelLoading } = useEvaluationModel(
    projectId,
    setModelParams,
  );

  const { mutateAsync: upsertDefaultModel, isPending: isUpsertLoading } =
    api.defaultLlmModel.upsertDefaultModel.useMutation({
      onSuccess: () => {
        showSuccessToast(successMessage);

        utils.defaultLlmModel.fetchDefaultModel.invalidate({ projectId });
        setFormError(null);
        onSuccess?.();
      },
      onError: (error) => {
        setFormError(error.message);
      },
    });

  const executeUpsertMutation = async () => {
    await upsertDefaultModel({
      projectId,
      provider: modelParams.provider.value,
      adapter: modelParams.adapter.value,
      model: modelParams.model.value,
      modelParams: getFinalModelParams(modelParams),
    });
  };

  return {
    availableModels,
    availableProviders,
    executeUpsertMutation,
    formError,
    hasWriteAccess,
    isDefaultModelLoading,
    isUpsertLoading,
    modelParams,
    providerModelCombinations,
    selectedModel,
    setModelParamEnabled,
    setFormError,
    updateModelParamValue,
  };
}

function DefaultEvalModelFields({
  setup,
  errorClassName = "w-full text-center",
}: {
  setup: ReturnType<typeof useDefaultEvalModelSetup>;
  errorClassName?: string;
}) {
  return (
    <>
      <ModelParameters
        customHeader={<p className="leading-none font-bold">LLM connection</p>}
        modelParams={setup.modelParams}
        availableModels={setup.availableModels}
        providerModelCombinations={setup.providerModelCombinations}
        availableProviders={setup.availableProviders}
        updateModelParamValue={setup.updateModelParamValue}
        setModelParamEnabled={setup.setModelParamEnabled}
        formDisabled={!setup.hasWriteAccess}
      />
      <p className="text-muted-foreground text-xs">
        Select a model which supports function calling.
      </p>
      {setup.formError ? (
        <p className={errorClassName}>
          <span className="font-bold">Error:</span> {setup.formError}
        </p>
      ) : null}
    </>
  );
}

export function DefaultEvalModelSetup({
  projectId,
  onSuccess,
}: {
  projectId: string;
  onSuccess?: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const setup = useDefaultEvalModelSetup({
    projectId,
    onSuccess: () => {
      setIsEditing(false);
      onSuccess?.();
    },
    successMessage: {
      title: "Default evaluation model updated",
      description: "All running evaluators will use the new model.",
    },
  });

  if (setup.isDefaultModelLoading) {
    return <Skeleton className="h-[500px] w-full" />;
  }

  return (
    <>
      <Card className="mt-3 flex flex-col gap-6">
        <CardContent>
          <p className="my-2 text-lg font-bold">
            Set up LLM connection to use for evaluations
          </p>
          <ManageDefaultEvalModel
            projectId={projectId}
            variant="color-coded"
            setUpMessage={
              <>
                LLM-as-a-judge evaluations require an LLM connection for
                scoring. You can also specify a custom model for each evaluator.{" "}
                <a
                  href="https://langfuse.com/docs/evaluation/evaluation-methods/llm-as-a-judge#how-llm-as-a-judge-works"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  Learn more.
                </a>
              </>
            }
            className="text-sm font-normal"
            showEditButton={false}
          />
        </CardContent>
      </Card>

      <div className="mt-2 flex justify-end gap-2">
        {setup.selectedModel && (
          <DeleteEvaluationModelButton
            projectId={projectId}
            scope="evalDefaultModel:CUD"
          />
        )}

        <Dialog
          open={isEditing}
          onOpenChange={(open) => {
            setIsEditing(open);
            if (!open) {
              setup.setFormError(null);
            }
          }}
        >
          <DialogTrigger asChild>
            <Button
              disabled={!setup.hasWriteAccess}
              onClick={() => {
                setIsEditing(true);
              }}
            >
              <Pencil className="mr-2 h-4 w-4" />
              {setup.selectedModel ? "Edit" : "Set up"}
            </Button>
          </DialogTrigger>
          <DialogContent className="px-3 py-10">
            <div className="flex flex-col gap-2">
              <DefaultEvalModelFields setup={setup} />
              <div className="mt-2 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                {setup.selectedModel ? (
                  <UpdateButton
                    projectId={projectId}
                    isLoading={setup.isUpsertLoading}
                    error={setup.formError ?? undefined}
                    executeUpsertMutation={setup.executeUpsertMutation}
                  />
                ) : (
                  <Button
                    disabled={
                      !setup.hasWriteAccess || !setup.modelParams.provider.value
                    }
                    onClick={setup.executeUpsertMutation}
                  >
                    Save
                  </Button>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </>
  );
}

export function InlineDefaultEvalModelSetup({
  projectId,
  onSuccess,
  submitLabel = "Save",
}: {
  projectId: string;
  onSuccess?: () => void;
  submitLabel?: string;
}) {
  const setup = useDefaultEvalModelSetup({
    projectId,
    onSuccess,
    successMessage: {
      title: "Default evaluation model set",
      description: "LLM-as-a-judge evaluators can now use this model.",
    },
  });

  if (setup.isDefaultModelLoading) {
    return <Skeleton className="h-[360px] w-full" />;
  }

  return (
    <>
      <div className="space-y-3">
        <DefaultEvalModelFields
          setup={setup}
          errorClassName="w-full text-center text-sm"
        />
      </div>
      <div className="flex w-full justify-end">
        <Button
          loading={setup.isUpsertLoading}
          disabled={!setup.hasWriteAccess || !setup.modelParams.provider.value}
          onClick={setup.executeUpsertMutation}
        >
          {submitLabel}
        </Button>
      </div>
    </>
  );
}

function UpdateButton({
  projectId,
  isLoading,
  error,
  executeUpsertMutation,
}: {
  projectId: string;
  isLoading: boolean;
  error?: string;
  executeUpsertMutation: () => Promise<void>;
}) {
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  return (
    <ConfirmationDialogController
      title="Update default model?"
      text="Updating the default model will impact any currently running evaluators that use it. Please confirm that you want to proceed with this change."
      confirmationText="update"
      confirmLabel="Confirm"
      variant="default"
      loading={isLoading}
      error={error}
      onConfirm={executeUpsertMutation}
    >
      {({ openDialog }) => (
        <Button
          disabled={!hasWriteAccess}
          onClick={(e) => {
            e.stopPropagation();
            openDialog();
          }}
        >
          Update
        </Button>
      )}
    </ConfirmationDialogController>
  );
}
