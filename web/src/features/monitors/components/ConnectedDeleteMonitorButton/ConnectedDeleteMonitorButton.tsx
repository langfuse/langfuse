import {
  DeleteButton,
  type DeleteButtonProps,
} from "@/src/components/deleteButton";
import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications";

export function ConnectedDeleteMonitorButton(props: DeleteButtonProps) {
  const utils = api.useUtils();
  const {
    itemId,
    projectId,
    scope = "alerts:CUD",
    invalidateFunc = () => utils.monitors.invalidate(),
  } = props;
  const monitorMutation = api.monitors.delete.useMutation({
    onSuccess: () => {
      showSuccessToast({
        operation: "monitor.delete",
        title: "Alert deleted",
        description: "The alert has been deleted successfully",
      });
      utils.monitors.invalidate();
    },
  });

  const executeDeleteMutation = async (onSuccess: () => void) => {
    try {
      await monitorMutation.mutateAsync({ id: itemId, projectId });
    } catch (error) {
      return Promise.reject(error);
    }
    onSuccess();
  };

  return (
    <DeleteButton
      {...props}
      scope={scope}
      invalidateFunc={invalidateFunc}
      captureDeleteOpen={(capture, isTableAction) =>
        capture("monitors:delete_form_open", {
          source: isTableAction ? "table-single-row" : "monitor",
        })
      }
      captureDeleteSuccess={(capture, isTableAction) =>
        capture("monitors:delete_monitor_button_click", {
          source: isTableAction ? "table-single-row" : "monitor",
        })
      }
      entityToDeleteName="alert"
      customDeletePrompt="This action cannot be undone. It stops all evaluations and removes its alert history."
      executeDeleteMutation={executeDeleteMutation}
      isDeleteMutationLoading={monitorMutation.isPending}
    />
  );
}
