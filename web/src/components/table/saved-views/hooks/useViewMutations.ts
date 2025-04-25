import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

type UseViewMutationsProps = {
  handleSetViewId: (viewId: string | null) => void;
};

export const useViewMutations = ({
  handleSetViewId,
}: UseViewMutationsProps) => {
  const utils = api.useUtils();

  const createMutation = api.savedViews.create.useMutation({
    onSuccess: (data) => {
      utils.savedViews.getByTableName.invalidate();
      handleSetViewId(data.view.id);
    },
  });

  const updateConfigMutation = api.savedViews.update.useMutation({
    onSuccess: (data) => {
      showSuccessToast({
        title: "View updated",
        description: `${data.view.name} has been updated to reflect your current table state`,
      });
    },
  });

  const updateNameMutation = api.savedViews.updateName.useMutation({
    onSuccess: () => {
      utils.savedViews.getByTableName.invalidate();
    },
  });

  const deleteMutation = api.savedViews.delete.useMutation({
    onSuccess: () => {
      utils.savedViews.getByTableName.invalidate();
      handleSetViewId(null);
    },
  });

  const generatePermalinkMutation =
    api.savedViews.generatePermalink.useMutation({
      onSuccess: (data) => {
        navigator.clipboard.writeText(data);
        showSuccessToast({
          title: "Permalink copied to clipboard",
          description: "You can now share the permalink with others",
        });
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
