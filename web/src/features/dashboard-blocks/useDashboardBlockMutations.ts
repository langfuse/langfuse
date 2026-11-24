import { api } from "@/src/utils/api";

type MutationContext = { projectId: string; dashboardId: string };

function invalidateDashboardBlockViews(
  utils: ReturnType<typeof api.useUtils>,
  context: MutationContext,
) {
  utils.dashboard.getDashboardBlocks.invalidate(context);
  utils.dashboard.getDashboard.invalidate(context);
  utils.dashboard.getHomeDashboard.invalidate({ projectId: context.projectId });
}

export function useSaveDashboardBlock({
  projectId,
  dashboardId,
  onSaved,
}: MutationContext & { onSaved: () => void }) {
  const utils = api.useUtils();
  return api.dashboard.updateDashboardDefinition.useMutation({
    onSuccess: () => {
      invalidateDashboardBlockViews(utils, { projectId, dashboardId });
      onSaved();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        invalidateDashboardBlockViews(utils, { projectId, dashboardId });
      }
    },
  });
}

export function useRemoveDashboardBlock({
  projectId,
  dashboardId,
  onRemoved,
}: MutationContext & { onRemoved: () => void }) {
  const utils = api.useUtils();
  return api.dashboard.updateDashboardDefinition.useMutation({
    onSuccess: () => {
      invalidateDashboardBlockViews(utils, { projectId, dashboardId });
      onRemoved();
    },
    onError: (error) => {
      if (error.data?.code === "CONFLICT") {
        invalidateDashboardBlockViews(utils, { projectId, dashboardId });
      }
    },
  });
}
