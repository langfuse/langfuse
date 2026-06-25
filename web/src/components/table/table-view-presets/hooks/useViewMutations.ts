import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { api } from "@/src/utils/api";
import { copyTextToClipboard } from "@/src/utils/clipboard";

type UseViewMutationsProps = {
  handleSetViewId: (viewId: string | null) => void;
};

export const useViewMutations = ({
  handleSetViewId,
}: UseViewMutationsProps) => {
  const utils = api.useUtils();

  const createMutation = api.TableViewPresets.create.useMutation({
    onSuccess: (data) => {
      utils.TableViewPresets.getByTableName.invalidate();
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
        title: "View updated",
        description: `${data.view.name} has been updated to reflect your current table state`,
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
              title: "Permalink copied to clipboard",
              description: "You can now share the permalink with others",
            }),
          )
          .catch(() =>
            showErrorToast(
              "Failed to copy permalink",
              "Could not write to the clipboard. Please copy the link manually.",
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
