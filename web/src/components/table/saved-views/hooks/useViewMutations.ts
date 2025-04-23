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

  return {
    createMutation,
    updateConfigMutation,
    updateNameMutation,
    deleteMutation,
  };
};
