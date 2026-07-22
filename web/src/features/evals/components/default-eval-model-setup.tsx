import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { ModelParameters } from "@/src/components/ModelParameters";
import { CardContent } from "@/src/components/ui/card";
import { Card } from "@/src/components/ui/card";
import { useModelParams } from "@/src/features/playground/page/hooks/useModelParams";
import { Button } from "@/src/components/ui/button";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useEvaluationModel } from "@/src/features/evals/hooks/useEvaluationModel";
import { DeleteEvaluationModelButton } from "@/src/components/deleteButton";
import { ManageDefaultEvalModel } from "@/src/features/evals/components/manage-default-eval-model";
import { useState } from "react";
import { DialogContent, DialogTrigger } from "@/src/components/ui/dialog";
import { getFinalModelParams } from "@/src/utils/getFinalModelParams";
import { Dialog } from "@/src/components/ui/dialog";
import { Pencil } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/src/components/ui/popover";
import { Label } from "@/src/components/ui/label";
import { Input } from "@/src/components/ui/input";

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
  executeUpsertMutation,
}: {
  projectId: string;
  isLoading: boolean;
  executeUpsertMutation: () => void;
}) {
  const [confirmationInput, setConfirmationInput] = useState("");
  const hasWriteAccess = useHasProjectAccess({
    projectId,
    scope: "evalDefaultModel:CUD",
  });

  const CONFIRMATION = "update";

  return (
    <Popover key="update-action">
      <PopoverTrigger asChild>
        <Button
          disabled={!hasWriteAccess}
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          Update
        </Button>
      </PopoverTrigger>
      <PopoverContent
        onClick={(e) => e.stopPropagation()}
        className="w-fit max-w-[500px]"
      >
        <h2 className="mb-3 font-bold">Please confirm</h2>
        <p className="mb-3 text-sm">
          Updating the default model will impact any currently running
          evaluators that use it. Please confirm that you want to proceed with
          this change.
        </p>
        <div className="mb-4 grid w-full gap-1.5">
          <Label htmlFor="update-confirmation">
            Type &quot;{CONFIRMATION}&quot; to confirm
          </Label>
          <Input
            id="update-confirmation"
            value={confirmationInput}
            onChange={(e) => setConfirmationInput(e.target.value)}
          />
        </div>
        <div className="flex justify-end space-x-4">
          <Button
            type="button"
            loading={isLoading}
            onClick={() => {
              if (confirmationInput !== CONFIRMATION) {
                alert("Please type the correct confirmation");
                return;
              }
              executeUpsertMutation();
            }}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
