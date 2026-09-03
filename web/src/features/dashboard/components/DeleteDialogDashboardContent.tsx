import { Button } from "@/src/components/ui/button";
import {
  DialogBody,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { api } from "@/src/utils/api";

export function DeleteDialogDashboardContent({
  closeDialog,
  projectId,
  dashboardId,
}: {
  closeDialog: () => void;
  projectId: string;
  dashboardId: string;
}) {
  const capture = usePostHogClientCapture();
  const utils = api.useUtils();
  const deleteDashboard = api.dashboard.delete.useMutation({
    onSuccess: () => {
      capture("dashboard:delete_dashboard_button_click");
      showSuccessToast({
        title: "Dashboard deleted",
        description: "The dashboard has been deleted successfully",
      });
      utils.dashboard.invalidate();
      closeDialog();
    },
    onError: (error) => {
      showErrorToast("Failed to delete dashboard", error.message);
    },
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>Delete dashboard</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <p className="text-muted-foreground py-4 text-sm">
          This action cannot be undone. It permanently deletes this dashboard.
        </p>
      </DialogBody>
      <DialogFooter>
        <div className="flex gap-2">
          <Button variant="outline" onClick={closeDialog}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            loading={deleteDashboard.isPending}
            onClick={() => deleteDashboard.mutate({ projectId, dashboardId })}
          >
            Delete dashboard
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
