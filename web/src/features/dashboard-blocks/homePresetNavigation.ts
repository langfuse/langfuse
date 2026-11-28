import { type NextRouter } from "next/router";
import type {
  DashboardBlocksContextValue,
  HomePresetDraft,
} from "./dashboard-block-context";

type PendingEdit = {
  projectId: string;
  dashboardId: string;
  preset: HomePresetDraft;
  preview: Pick<
    DashboardBlocksContextValue,
    "dateRange" | "filterState" | "readPath"
  >;
};

// Home's reader filters and card selections belong only to this editor visit.
let pending: PendingEdit | undefined;

export async function openPresetInDashboardCopy(
  router: Pick<NextRouter, "push">,
  edit: PendingEdit,
) {
  pending = edit;
  const range = edit.preview.dateRange;
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
      },
    });
  } finally {
    if (!navigated && pending === edit) pending = undefined;
  }
}

export function getPendingPresetEdit(projectId: string, dashboardId: string) {
  if (pending?.projectId !== projectId || pending.dashboardId !== dashboardId)
    return;
  return pending;
}

export function clearPendingPresetEdit(edit: PendingEdit) {
  if (pending === edit) pending = undefined;
}
