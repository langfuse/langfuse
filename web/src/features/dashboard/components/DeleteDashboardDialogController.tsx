import { type ReactNode, useState } from "react";

import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";

export function DeleteDashboardDialogController({
  children,
  dashboardId,
  projectId,
}: {
  children: (control: {
    disabled: { reason: string } | undefined;
    openDialog: () => void;
  }) => ReactNode;
  dashboardId: string;
  projectId: string;
}) {
  const capture = usePostHogClientCapture();
  const [open, setOpen] = useState(false);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });
  const utils = api.useUtils();
  const deleteMutation = api.dashboard.delete.useMutation();

  const disabled = hasAccess
    ? undefined
    : { reason: "You don't have permission to delete this dashboard." };

  const openDialog = () => {
    if (!hasAccess) return;

    setOpen(true);
    capture("dashboard:delete_dashboard_form_open");
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync({ dashboardId, projectId });
      capture("dashboard:delete_dashboard_button_click");
      showSuccessToast({
        title: "Dashboard deleted",
        description: "The dashboard has been deleted successfully",
      });
      utils.dashboard.invalidate();
      setOpen(false);
    } catch {
      // The tRPC error handler owns mutation failures; keep the dialog open.
    }
  };

  return (
    <>
      {children({ disabled, openDialog })}
      <ConfirmDialog
        open={hasAccess && open}
        onOpenChange={setOpen}
        title="Please confirm"
        description="This action cannot be undone. It removes all the data associated with this dashboard. If this is the project default, it will be deleted for all users."
        confirmLabel="Delete dashboard"
        loading={deleteMutation.isPending}
        onConfirm={handleDelete}
      />
    </>
  );
}
