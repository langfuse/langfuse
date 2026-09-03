import { type ReactNode, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { ExternalLinkIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import {
  DialogController,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Button } from "@/src/components/ui/button";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { type DashboardPlacement } from "@/src/features/widgets/components/DashboardGrid";

/**
 * Clone-first flow for Langfuse-managed (read-only) dashboards: any edit
 * attempt routes here instead of being blocked. Confirming clones the
 * dashboard into the project (optionally carrying the attempted change via
 * `pendingDefinition` and setting the clone as the project's Home) and
 * navigates to the editable copy.
 */
type CloneFirstDialogControllerProps = {
  projectId: string;
  dashboardId: string;
  dashboardName: string;
  /** Set the clone as this project's Home dashboard in the same gesture. */
  setAsHome?: boolean;
  /** The attempted edit (e.g. moved/removed tile) to apply to the clone. */
  pendingDefinition?: { widgets: DashboardPlacement[] } | null;
  /** Called when the user dismisses without cloning (revert the attempt). */
  onCancel?: () => void;
};

export function CloneFirstDialogController({
  children,
  ...props
}: CloneFirstDialogControllerProps & {
  children: (control: { openDialog: () => void }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const cloneInFlightRef = useRef(false);
  const handleCancel = () => {
    capture("dashboard:clone_first_cancelled", {
      dashboard_id: props.dashboardId,
      had_pending_change: Boolean(props.pendingDefinition),
    });
    props.onCancel?.();
  };

  return (
    <DialogController
      closeOnInteractionOutside={false}
      onBeforeClose={() => !cloneInFlightRef.current}
      onDismiss={handleCancel}
      size="default"
      renderContent={({ closeDialog }) => (
        <CloneFirstDialogContent
          {...props}
          closeDialog={closeDialog}
          cancelDialog={() => {
            if (cloneInFlightRef.current) return false;
            closeDialog();
            handleCancel();
            return true;
          }}
          onPendingChange={(isPending) => {
            cloneInFlightRef.current = isPending;
          }}
        />
      )}
    >
      {({ openDialog }) => children({ openDialog })}
    </DialogController>
  );
}

function CloneFirstDialogContent({
  closeDialog,
  cancelDialog,
  onPendingChange,
  projectId,
  dashboardId,
  dashboardName,
  setAsHome = false,
  pendingDefinition,
}: Omit<CloneFirstDialogControllerProps, "onCancel"> & {
  closeDialog: () => void;
  cancelDialog: () => boolean;
  onPendingChange: (isPending: boolean) => void;
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  // Detect existing copies of this dashboard so we can offer navigating to
  // one instead of accumulating "(Clone)" duplicates.
  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      page: 1,
      limit: 500,
      orderBy: { column: "updatedAt", order: "DESC" },
    },
    { enabled: true },
  );
  const existingClone = useMemo(() => {
    const cloneName = `${dashboardName} (Clone)`;
    const numberedClonePrefix = `${dashboardName} (Clone `;
    return dashboards.data?.dashboards.find((dashboard) => {
      if (dashboard.owner !== "PROJECT") return false;
      if (dashboard.name === cloneName) return true;
      if (!dashboard.name.startsWith(numberedClonePrefix)) return false;
      if (!dashboard.name.endsWith(")")) return false;

      const cloneNumber = dashboard.name.slice(numberedClonePrefix.length, -1);
      return /^\d+$/.test(cloneNumber);
    });
  }, [dashboards.data?.dashboards, dashboardName]);

  const cloneDashboard = api.dashboard.cloneDashboard.useMutation({
    onSuccess: (data) => {
      onPendingChange(false);
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard", {
        source: "clone_first_dialog",
        set_as_home: setAsHome,
        had_pending_change: Boolean(pendingDefinition),
        dashboardId,
        // The clone-first flow only exists for locked Langfuse-owned dashboards.
        owner: "LANGFUSE",
      });
      showSuccessToast({
        title: "Editable copy created",
        description: setAsHome
          ? "The copy is now this project's Home dashboard"
          : "You are now working on your own copy",
        duration: 3000,
      });
      closeDialog();
      if (data?.id) {
        router.push(
          `/project/${projectId}/dashboards/${encodeURIComponent(data.id)}`,
        );
      }
    },
    onError: (e) => {
      onPendingChange(false);
      showErrorToast("Failed to create copy", e.message);
    },
  });

  const handleConfirm = () => {
    onPendingChange(true);
    cloneDashboard.mutate({
      projectId,
      dashboardId,
      definition: pendingDefinition ?? undefined,
      setAsHome,
    });
  };

  const handleClose = () => {
    cancelDialog();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Create your editable copy</DialogTitle>
      </DialogHeader>
      <DialogBody>
        <div className="text-muted-foreground grid gap-3 py-4 text-sm">
          <p>
            <span className="text-foreground font-bold">
              &ldquo;{dashboardName}&rdquo;
            </span>{" "}
            is maintained by Langfuse and can&rsquo;t be edited directly.
            We&rsquo;ll create your own editable copy in this project
            {pendingDefinition ? " with your change applied" : ""}
            {setAsHome ? " and show it on your Home page from now on" : ""}.
          </p>
          <p>
            Langfuse-maintained tiles on the copy can be rearranged or removed;
            editing their content will become available in a future release.
          </p>
          {existingClone && (
            <div className="bg-muted/50 flex flex-wrap items-center justify-between gap-2 rounded-md border p-3">
              <span>
                You already have a copy:{" "}
                <span className="text-foreground font-bold">
                  &ldquo;{existingClone.name}&rdquo;
                </span>
                {pendingDefinition
                  ? " — opening it will discard your attempted change"
                  : ""}
              </span>
              <Button
                variant="outline"
                size="sm"
                type="button"
                disabled={cloneDashboard.isPending}
                onClick={() => {
                  capture("dashboard:clone_open_existing_click", {
                    dashboard_id: dashboardId,
                    existing_clone_id: existingClone.id,
                    had_pending_change: Boolean(pendingDefinition),
                  });
                  if (!cancelDialog()) return;
                  router.push(
                    `/project/${projectId}/dashboards/${encodeURIComponent(existingClone.id)}`,
                  );
                }}
              >
                <ExternalLinkIcon size={14} className="mr-1" />
                Open it instead
              </Button>
            </div>
          )}
        </div>
      </DialogBody>
      <DialogFooter>
        <div className="flex gap-2">
          <Button
            onClick={handleClose}
            variant="outline"
            type="button"
            disabled={cloneDashboard.isPending}
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
    </>
  );
}
