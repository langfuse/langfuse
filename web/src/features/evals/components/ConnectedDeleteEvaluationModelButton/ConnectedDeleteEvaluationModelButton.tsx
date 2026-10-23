import {
  DeleteButton,
  type DeleteButtonProps,
} from "@/src/components/deleteButton";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications";

export function ConnectedDeleteEvaluationModelButton(
  props: Omit<DeleteButtonProps, "itemId">,
) {
  const utils = api.useUtils();
  const {
    projectId,
    scope = "evalDefaultModel:CUD",
    invalidateFunc = () => utils.defaultLlmModel.invalidate(),
  } = props;

  const { mutateAsync: deleteDefaultModel, isPending } =
    api.defaultLlmModel.deleteDefaultModel.useMutation({
      onSuccess: () => {
        showSuccessToast({
          operation: "evaluation_model.delete",
          title: "Default evaluation model deleted",
          description:
            "The default evaluation model has been deleted. Any running evaluations relying on the default model will be inactivated. Queued jobs will fail.",
        });
        utils.defaultLlmModel.fetchDefaultModel.invalidate({ projectId });
      },
    });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await deleteDefaultModel({
        projectId,
      });
    } catch (error) {
      return Promise.reject(error);
    }
    onSuccess();
  };

  return (
    <DeleteButton
      {...props}
      variant="outline"
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("eval_config:delete_form_open", {
          source: isTableAction ? "table-single-row" : "evaluator",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("eval_config:delete_evaluator_button_click", {
          source: isTableAction ? "table-single-row" : "evaluator",
        })
      }
      entityToDeleteName="default evaluation model"
      customDeletePrompt="Deleting this model might cause running evaluators to fail. Please make sure you have no running evaluators relying on this model."
      deleteConfirmation="delete"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={isPending}
    />
  );
}
