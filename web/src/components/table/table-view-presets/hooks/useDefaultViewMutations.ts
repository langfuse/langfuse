import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type DefaultViewScope } from "@langfuse/shared/src/server";

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
      const scopeLabel = variables.scope === "user" ? "your" : "project";
      showSuccessToast({
        title: "Default view set",
        description: `Set as ${scopeLabel} default`,
      });
    },
    onError: (error) => {
      showErrorToast("Failed to set default", error.message);
    },
  });

  const clearDefault = api.TableViewPresets.clearDefault.useMutation({
    onSuccess: (_, variables) => {
      utils.TableViewPresets.getDefault.invalidate({
        projectId,
        viewName: tableName,
      });
      const scopeLabel = variables.scope === "user" ? "Your" : "Project";
      showSuccessToast({
        title: "Default cleared",
        description: `${scopeLabel} default view cleared`,
      });
    },
    onError: (error) => {
      showErrorToast("Failed to clear default", error.message);
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
    isClearingDefault: clearDefault.isPending,
  };
}
