import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { api } from "@/src/utils/api";

type UseViewMutationsProps = {};

export const useViewMutations = () => {
  const utils = api.useUtils();

  const createMutation = api.savedViews.create.useMutation({
    onSuccess: () => {
      utils.savedViews.getByTableName.invalidate();
    },
  });

  const updateConfigMutation = api.savedViews.update.useMutation({
    onSuccess: () => {
      utils.savedViews.getByTableName.invalidate();
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
