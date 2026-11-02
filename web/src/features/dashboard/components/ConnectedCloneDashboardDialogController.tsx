import { type ReactNode, useMemo, useRef } from "react";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { DialogController } from "@/src/components/design-system/DialogController/DialogController";
import { CloneDashboardDialog } from "./CloneDashboardDialog";
import { showErrorToast, showSuccessToast } from "@/src/features/notifications";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import type { DashboardPlacement } from "@/src/features/widgets";
import { classifyTrpcToastError } from "@/src/utils/trpcErrorClassification";

/**
 * Clone-first flow for Langfuse-managed (read-only) dashboards: any edit
 * attempt routes here instead of being blocked. Confirming clones the
 * dashboard into the project (optionally carrying the attempted change via
 * `pendingDefinition` and setting the clone as the project's Home) and
 * navigates to the editable copy.
 */
type CloneDashboardDialogState = {
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

export function ConnectedCloneDashboardDialogController({
  children,
}: {
  children: (control: {
    openDialog: (state: CloneDashboardDialogState) => void;
  }) => ReactNode;
}) {
  const capture = usePostHogClientCapture();
  const cloneInFlightRef = useRef(false);
  const onDismissRef = useRef<(() => void) | undefined>(undefined);

  return (
    <DialogController<CloneDashboardDialogState>
      onBeforeClose={() => !cloneInFlightRef.current}
      onDismiss={() => onDismissRef.current?.()}
      renderDialog={({ state, closeDialog }) => (
        <ConnectedCloneDashboardDialog
          {...state}
          closeDialog={closeDialog}
          cancelDialog={() => {
            if (cloneInFlightRef.current) return false;
            closeDialog();
            onDismissRef.current?.();
            return true;
          }}
          onPendingChange={(isPending) => {
            cloneInFlightRef.current = isPending;
          }}
        />
      )}
    >
      {({ openDialog }) =>
        children({
          openDialog: (state) => {
            onDismissRef.current = () => {
              capture("dashboard:clone_first_cancelled", {
                dashboard_id: state.dashboardId,
                had_pending_change: Boolean(state.pendingDefinition),
              });
              state.onCancel?.();
            };
            openDialog(state);
          },
        })
      }
    </DialogController>
  );
}

function ConnectedCloneDashboardDialog({
  closeDialog,
  cancelDialog,
  onPendingChange,
  projectId,
  dashboardId,
  dashboardName,
  setAsHome = false,
  pendingDefinition,
}: Omit<CloneDashboardDialogState, "onCancel"> & {
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
        operation: "dashboard.clone",
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
      showErrorToast(
        "Failed to create copy",
        e.message,
        classifyTrpcToastError(e, "dashboard.clone"),
      );
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

  return (
    <CloneDashboardDialog
      dashboardName={dashboardName}
      setAsHome={setAsHome}
      hasPendingChange={Boolean(pendingDefinition)}
      existingCloneName={existingClone?.name}
      isPending={cloneDashboard.isPending}
      onConfirm={handleConfirm}
      onOpenExisting={() => {
        if (!existingClone) return;
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
    />
  );
}
