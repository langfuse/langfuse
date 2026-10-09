import { api } from "@/src/utils/api";
import { showSuccessToast, showErrorToast } from "@/src/features/notifications";
import { type DefaultViewScope } from "@langfuse/shared/src/server";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

interface UseDefaultViewMutationsProps {
  tableName: string;
  projectId: string;
}

export function useDefaultViewMutations({
  tableName,
  projectId,
}: UseDefaultViewMutationsProps) {
  const utils = api.useUtils();

  const setAsDefault = api.TableViewPresets.setAsDefault.useMutation({
    onSuccess: (_, variables) => {
      utils.TableViewPresets.getDefault.invalidate({
        projectId,
        viewName: tableName,
      });
      utils.TableViewPresets.getDefaultAssignments.invalidate({
        projectId,
        viewName: tableName,
      });
      const scopeLabel = variables.scope === "user" ? "your" : "project";
      showSuccessToast({
        operation: "saved_view.default_set",
        title: "Default view set",
        description: `Set as ${scopeLabel} default`,
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to set default",
        error.message,
        classifyTrpcToastError(error, "saved_view.default_set"),
      );
    },
  });

  const clearDefault = api.TableViewPresets.clearDefault.useMutation({
    onSuccess: (_, variables) => {
      utils.TableViewPresets.getDefault.invalidate({
        projectId,
        viewName: tableName,
      });
      utils.TableViewPresets.getDefaultAssignments.invalidate({
        projectId,
        viewName: tableName,
      });
      const scopeLabel = variables.scope === "user" ? "Your" : "Project";
      showSuccessToast({
        operation: "saved_view.default_clear",
        title: "Default cleared",
        description: `${scopeLabel} default view cleared`,
      });
    },
    onError: (error) => {
      showErrorToast(
        "Failed to clear default",
        error.message,
        classifyTrpcToastError(error, "saved_view.default_clear"),
      );
    },
  });

  const setViewAsDefault = (viewId: string, scope: DefaultViewScope) => {
    setAsDefault.mutate({
      projectId,
      viewId,
      viewName: tableName,
      scope,
    });
  };

  const clearViewDefault = (scope: DefaultViewScope) => {
    clearDefault.mutate({
      projectId,
      viewName: tableName,
      scope,
    });
  };

  return {
    setViewAsDefault,
    clearViewDefault,
    isSettingDefault: setAsDefault.isPending,
  };
}
