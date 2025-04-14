import { api } from "@/src/utils/api";

type UseViewMutationsProps = {};

export const useViewMutations = () => {
  const createMutation = api.savedViews.create.useMutation({});

  const updateMutation = api.savedViews.update.useMutation({});

  const deleteMutation = api.savedViews.delete.useMutation({});

  return {
    createMutation,
    updateMutation,
    deleteMutation,
  };
};
