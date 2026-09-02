import { useState } from "react";
import { Copy, Edit, MoreVertical, Trash } from "lucide-react";

import { Button } from "@/src/components/ui/button";
import {
  DropdownMenuController,
  DropdownMenuItem,
} from "@/src/components/ui/dropdown-menu";
import { CloneFirstDialog } from "@/src/features/dashboard/components/CloneFirstDialog";
import { DeleteDashboardDialogController } from "@/src/features/dashboard/components/DeleteDashboardDialogController";
import { EditDashboardDialog } from "@/src/features/dashboard/components/EditDashboardDialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

export type DashboardRowActionsDashboard = {
  id: string;
  name: string;
  description: string;
  owner: "PROJECT" | "LANGFUSE";
};

export function DashboardRowActions({
  projectId,
  dashboard,
}: {
  projectId: string;
  dashboard: DashboardRowActionsDashboard;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [cloneFirstOpen, setCloneFirstOpen] = useState(false);
  const hasAccess = useHasProjectAccess({ projectId, scope: "dashboards:CUD" });
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to change this dashboard." };

  const mutCloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard", {
        source: "list_clone_button",
        dashboardId: dashboard.id,
        owner: dashboard.owner,
      });
      showSuccessToast({
        title: "Dashboard cloned",
        description: "The dashboard has been cloned successfully",
      });
    },
    onError: (e) => {
      showErrorToast("Failed to clone dashboard", e.message);
    },
  });

  const openEdit = () => {
    if (!hasAccess) return;

    if (dashboard.owner === "PROJECT") {
      setEditOpen(true);
      return;
    }

    capture("dashboard:locked_edit_attempt", {
      dashboard_id: dashboard.id,
      attempt: "list_edit",
      surface: "list",
    });
    setCloneFirstOpen(true);
  };

  const handleClone = () => {
    if (!hasAccess) return;

    mutCloneDashboard.mutateAsync({
      projectId,
      dashboardId: dashboard.id,
    });
  };

  return (
    <DeleteDashboardDialogController
      projectId={projectId}
      dashboardId={dashboard.id}
    >
      {({ disabled: deleteDisabled, openDialog }) => (
        <div onClick={(event) => event.stopPropagation()}>
          <DropdownMenuController
            align="end"
            renderMenu={() => (
              <>
                <DropdownMenuItem
                  allowPointerEventsWhenDisabled
                  disabled={disabled !== undefined}
                  title={disabled?.reason}
                  onClick={openEdit}
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  allowPointerEventsWhenDisabled
                  disabled={disabled !== undefined}
                  title={disabled?.reason}
                  onClick={handleClone}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Clone
                </DropdownMenuItem>
                {dashboard.owner === "PROJECT" ? (
                  <DropdownMenuItem
                    allowPointerEventsWhenDisabled
                    disabled={deleteDisabled !== undefined}
                    title={deleteDisabled?.reason}
                    className="text-destructive focus:text-destructive"
                    onClick={openDialog}
                  >
                    <Trash className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                ) : null}
              </>
            )}
          >
            {({ Trigger }) => (
              <Trigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </Trigger>
            )}
          </DropdownMenuController>
          {dashboard.owner === "PROJECT" && editOpen ? (
            <EditDashboardDialog
              open={editOpen}
              onOpenChange={setEditOpen}
              projectId={projectId}
              dashboardId={dashboard.id}
              initialName={dashboard.name}
              initialDescription={dashboard.description}
            />
          ) : null}
          {dashboard.owner !== "PROJECT" && cloneFirstOpen ? (
            <CloneFirstDialog
              open={cloneFirstOpen}
              onOpenChange={setCloneFirstOpen}
              projectId={projectId}
              dashboardId={dashboard.id}
              dashboardName={dashboard.name}
            />
          ) : null}
        </div>
      )}
    </DeleteDashboardDialogController>
  );
}
