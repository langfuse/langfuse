import React from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";

/**
 * Clone-first flow for Langfuse-managed (read-only) dashboards: any edit
 * attempt routes here instead of being blocked. Confirming clones the
 * dashboard into the project (optionally carrying the attempted change via
 * `pendingDefinition` and setting the clone as the project's Home) and
 * navigates to the editable copy.
 */
export function CloneFirstDialog({
  open,
  onOpenChange,
  projectId,
  dashboardId,
  dashboardName,
  setAsHome = false,
  pendingDefinition,
  onCancel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  dashboardId: string;
  dashboardName: string;
  /** Set the clone as this project's Home dashboard in the same gesture. */
  setAsHome?: boolean;
  /** The attempted edit (e.g. moved/removed tile) to apply to the clone. */
  pendingDefinition?: { widgets: DashboardPlacement[] } | null;
  /** Called when the user dismisses without cloning (revert the attempt). */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const cloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: (data) => {
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard");
      showSuccessToast({
        title: "Editable copy created",
        description: setAsHome
          ? "The copy is now this project's Home dashboard"
          : "You are now working on your own copy",
        duration: 3000,
      });
      onOpenChange(false);
      if (data?.id) {
        router.push(
          `/project/${projectId}/dashboards/${encodeURIComponent(data.id)}`,
        );
      }
    },
    onError: (e) => {
      showErrorToast("Failed to create copy", e.message);
    },
  });

  const handleConfirm = () => {
    cloneDashboard.mutate({
      projectId,
      dashboardId,
      definition: pendingDefinition ?? undefined,
      setAsHome,
    });
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && !cloneDashboard.isPending) {
      onCancel?.();
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Create your editable copy</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="text-muted-foreground grid gap-3 py-4 text-sm">
            <p>
              <span className="text-foreground font-medium">
                &ldquo;{dashboardName}&rdquo;
              </span>{" "}
              is maintained by Langfuse and can&rsquo;t be edited directly.
              We&rsquo;ll create your own editable copy in this project
              {pendingDefinition ? " with your change applied" : ""}
              {setAsHome ? " and show it on your Home page from now on" : ""}.
            </p>
            <p>
              Langfuse-maintained tiles on the copy can be rearranged or
              removed; editing their content will become available in a future
              release.
            </p>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex gap-2">
            <Button
              onClick={() => handleOpenChange(false)}
              variant="outline"
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleConfirm}
              type="button"
              loading={cloneDashboard.isPending}
            >
              Create my copy
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
