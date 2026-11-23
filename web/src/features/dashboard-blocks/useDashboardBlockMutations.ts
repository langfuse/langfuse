import { api } from "@/src/utils/api";

type MutationContext = { projectId: string; dashboardId: string };

export function useSaveDashboardBlock({
  projectId,
  dashboardId,
  onSaved,
}: MutationContext & { onSaved: () => void }) {
  const utils = api.useUtils();
  return api.dashboardBlocks.save.useMutation({
    onSuccess: () => {
      utils.dashboardBlocks.getAll.invalidate({ projectId, dashboardId });
      onSaved();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT")
        utils.dashboardBlocks.getAll.invalidate({ projectId, dashboardId });
    },
  });
}

export function useRemoveDashboardBlock({
  projectId,
  dashboardId,
  onRemoved,
}: MutationContext & { onRemoved: () => void }) {
  const utils = api.useUtils();
  return api.dashboardBlocks.remove.useMutation({
    onSuccess: () => {
      utils.dashboardBlocks.getAll.invalidate({ projectId, dashboardId });
      onRemoved();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT")
        utils.dashboardBlocks.getAll.invalidate({ projectId, dashboardId });
    },
  });
}
