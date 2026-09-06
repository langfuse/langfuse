import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";
import type { TableViewPresetState } from "@langfuse/shared";
import { useTranslations } from "next-intl";

type UseViewMutationsProps = {
  handleSetViewId: (viewId: string | null) => void;
  applyViewState: (view: TableViewPresetState) => void;
};

export const useViewMutations = ({
  handleSetViewId,
  applyViewState,
}: UseViewMutationsProps) => {
  const t = useTranslations("sharedUi.viewMutations");
  const utils = api.useUtils();

  const createMutation = api.TableViewPresets.create.useMutation({
    onSuccess: (data) => {
      utils.TableViewPresets.getByTableName.invalidate();
      applyViewState(data.view);
      handleSetViewId(data.view.id);
    },
  });

  const updateConfigMutation = api.TableViewPresets.update.useMutation({
    onSuccess: (data) => {
      utils.TableViewPresets.getById.invalidate({
        viewId: data.view.id,
      });
      utils.TableViewPresets.getByTableName.invalidate();
      showSuccessToast({
        title: t("viewUpdated"),
        description: t("viewUpdatedDescription", { name: data.view.name }),
      });
    },
  });

  const updateNameMutation = api.TableViewPresets.updateName.useMutation({
    onSuccess: () => {
      utils.TableViewPresets.getByTableName.invalidate();
    },
  });

  const deleteMutation = api.TableViewPresets.delete.useMutation({
    onSuccess: () => {
      utils.TableViewPresets.getByTableName.invalidate();
      handleSetViewId(null);
    },
  });

  const generatePermalinkMutation =
    api.TableViewPresets.generatePermalink.useMutation({
      onSuccess: (data) => {
        // Toast on the clipboard write's resolution so a permission failure
        // surfaces an error instead of falsely reporting success.
        copyTextToClipboard(data)
          .then(() =>
            showSuccessToast({
              title: t("permalinkCopied"),
              description: t("permalinkCopiedDescription"),
            }),
          )
          .catch(() =>
            showErrorToast(
              t("copyPermalinkFailed"),
              t("copyPermalinkFailedDescription"),
              "WARNING",
            ),
          );
      },
    });

  return {
    createMutation,
    updateConfigMutation,
    updateNameMutation,
    deleteMutation,
    generatePermalinkMutation,
  };
};
