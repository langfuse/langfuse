import {
  DeleteButton,
  type DeleteButtonProps,
} from "@/src/components/DeleteButton/DeleteButton";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications";

export function ConnectedDeleteEvalConfigButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "evaluationRule:CUD",
    invalidateFunc = () => utils.evals.invalidate(),
  } = props;

  const evaluatorMutation = api.evals.deleteEvalJob.useMutation({
    onSuccess: () => {
      showSuccessToast({
        operation: "evaluator.delete",
        title: "Running evaluator deleted",
        description: "The running evaluator has been deleted successfully",
      });
      utils.evals.invalidate();
    },
  });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await evaluatorMutation.mutateAsync({
        evalConfigId: itemId,
        projectId,
      });
      onSuccess();
    } catch (error) {
      return Promise.reject(error);
    }
  };

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("eval_config:delete_form_open", {
          source: isTableAction ? "table-single-row" : "eval config detail",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("eval_config:delete_evaluator_button_click", {
          source: isTableAction ? "table-single-row" : "eval config detail",
        })
      }
      customDeletePrompt="This action cannot be undone and removes all logs associated with this running evaluator. Scores produced by this evaluator will not be deleted."
      entityToDeleteName="running evaluator"
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={evaluatorMutation.isPending}
    />
  );
}
