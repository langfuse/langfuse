import { api } from "@/src/utils/api";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { type DefaultViewScope } from "@langfuse/shared/src/server";
import { useTranslations } from "next-intl";

interface UseDefaultViewMutationsProps {
  tableName: string;
  projectId: string;
}

export function useDefaultViewMutations({
  tableName,
  projectId,
}: UseDefaultViewMutationsProps) {
  const t = useTranslations("sharedUi.viewMutations");
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
      showSuccessToast({
        title: t("defaultSet"),
        description:
          variables.scope === "user"
            ? t("userDefaultSet")
            : t("projectDefaultSet"),
      });
    },
    onError: (error) => {
      showErrorToast(t("setDefaultFailed"), error.message);
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
      showSuccessToast({
        title: t("defaultCleared"),
        description:
          variables.scope === "user"
            ? t("userDefaultCleared")
            : t("projectDefaultCleared"),
      });
    },
    onError: (error) => {
      showErrorToast(t("clearDefaultFailed"), error.message);
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
