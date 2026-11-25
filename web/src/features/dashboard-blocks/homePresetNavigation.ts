import { type NextRouter } from "next/router";
import type { HomePresetDraft } from "./dashboard-block-context";

type PendingEdit = {
  projectId: string;
  dashboardId: string;
  preset: HomePresetDraft;
};

// Keep model names and score selections in this browser tab while Next navigates.
let pending: PendingEdit | undefined;

export async function openPresetInDashboardCopy(
  router: NextRouter,
  edit: PendingEdit,
  range: { from: Date; to: Date } | undefined,
) {
  pending = edit;
  let navigated = false;
  try {
    navigated = await router.push({
      pathname: "/project/[projectId]/dashboards/[dashboardId]",
      query: {
        projectId: edit.projectId,
        dashboardId: edit.dashboardId,
        ...(range && {
          dateRange: `${range.from.getTime()}-${range.to.getTime()}`,
        }),
        ...(router.query.filter && { filter: router.query.filter }),
      },
    });
  } finally {
    if (!navigated && pending === edit) pending = undefined;
  }
}

export function getPendingPresetEdit(projectId: string, dashboardId: string) {
  if (pending?.projectId !== projectId || pending.dashboardId !== dashboardId)
    return;
  return pending.preset;
}

export function clearPendingPresetEdit(preset: HomePresetDraft) {
  if (pending?.preset === preset) pending = undefined;
}
