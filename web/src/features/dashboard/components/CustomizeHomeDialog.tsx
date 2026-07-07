import { useMemo, useState } from "react";
import { useRouter } from "next/router";
import { PencilIcon } from "lucide-react";
import { api } from "@/src/utils/api";
import { LANGFUSE_HOME_DASHBOARD_ID } from "@langfuse/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogBody,
} from "@/src/components/ui/dialog";
import { Combobox } from "@/src/components/ui/combobox";
import { Button } from "@/src/components/ui/button";
import { Label } from "@/src/components/ui/label";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

/**
 * The Home page's single edit gesture: pick which dashboard renders on Home
 * (applied on confirm, not on select) or step into editing the current one —
 * directly for project-owned dashboards, via an editable copy (which becomes
 * Home) for Langfuse-managed ones.
 */
export function CustomizeHomeButton({
  projectId,
  homeDashboardId,
  currentDashboard,
}: {
  projectId: string;
  homeDashboardId: string | null;
  currentDashboard: { id: string; name: string; owner: "LANGFUSE" | "PROJECT" };
}) {
  const [open, setOpen] = useState(false);
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  if (!hasCUDAccess) return null;

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <PencilIcon size={16} className="mr-1 h-4 w-4" />
        Edit
      </Button>
      {open && (
        <CustomizeHomeDialog
          open={open}
          onOpenChange={setOpen}
          projectId={projectId}
          homeDashboardId={homeDashboardId}
          currentDashboard={currentDashboard}
        />
      )}
    </>
  );
}

function CustomizeHomeDialog({
  open,
  onOpenChange,
  projectId,
  homeDashboardId,
  currentDashboard,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  homeDashboardId: string | null;
  currentDashboard: { id: string; name: string; owner: "LANGFUSE" | "PROJECT" };
}) {
  const router = useRouter();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();

  const [selectedId, setSelectedId] = useState(
    homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID,
  );

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
      orderBy: { column: "name", order: "ASC" },
    },
    { enabled: Boolean(projectId) },
  );

  const setHomeDashboard = api.dashboard.setHomeDashboard.useMutation({
    onSuccess: () => {
      utils.dashboard.getHomeDashboard.invalidate();
      showSuccessToast({
        title: "Home dashboard updated",
        description:
          "This project's home page now shows the selected dashboard",
        duration: 2000,
      });
      onOpenChange(false);
    },
    onError: (e) => {
      showErrorToast("Failed to update home dashboard", e.message);
    },
  });

  const cloneAsHome = api.dashboard.cloneDashboard.useMutation({
    onSuccess: (data) => {
      utils.dashboard.invalidate();
      capture("dashboard:clone_dashboard");
      showSuccessToast({
        title: "Editable copy created",
        description: "The copy is now this project's Home dashboard",
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

  const options = useMemo(() => {
    const items = dashboards.data?.dashboards ?? [];
    const curated = items.filter((d) => d.owner === "LANGFUSE");
    const project = items.filter((d) => d.owner === "PROJECT");
    return [
      ...(project.length > 0
        ? [
            {
              heading: "This project",
              options: project.map((d) => ({ value: d.id, label: d.name })),
            },
          ]
        : []),
      {
        heading: "Langfuse-maintained",
        options: curated.map((d) => ({
          value: d.id,
          label:
            d.id === LANGFUSE_HOME_DASHBOARD_ID
              ? `${d.name} (default)`
              : d.name,
        })),
      },
    ];
  }, [dashboards.data?.dashboards]);

  const currentValue = homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID;
  const selectionChanged = selectedId !== currentValue;
  const isCurrentLocked = currentDashboard.owner === "LANGFUSE";

  const handleApply = () => {
    setHomeDashboard.mutate({
      projectId,
      dashboardId:
        selectedId === LANGFUSE_HOME_DASHBOARD_ID ? null : selectedId,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Customize Home</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-6 py-4">
            <div className="grid gap-2">
              <Label>Dashboard shown on Home</Label>
              <Combobox
                options={options}
                value={selectedId}
                onValueChange={(id) => {
                  if (typeof id === "string") setSelectedId(id);
                }}
                placeholder="Select a dashboard..."
                searchPlaceholder="Search dashboards..."
                emptyText="No dashboards found"
              />
              <p className="text-muted-foreground text-xs">
                Applies to everyone in this project.
              </p>
            </div>
            <div className="grid gap-2">
              <Label>Edit &ldquo;{currentDashboard.name}&rdquo;</Label>
              {isCurrentLocked ? (
                <>
                  <p className="text-muted-foreground text-xs">
                    This dashboard is maintained by Langfuse and can&rsquo;t be
                    edited directly. Create your own editable copy — it becomes
                    this project&rsquo;s Home.
                  </p>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      cloneAsHome.mutate({
                        projectId,
                        dashboardId: currentDashboard.id,
                        setAsHome: true,
                      })
                    }
                    loading={cloneAsHome.isPending}
                  >
                    Create editable copy & set as Home
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  onClick={() =>
                    router.push(
                      `/project/${projectId}/dashboards/${encodeURIComponent(currentDashboard.id)}`,
                    )
                  }
                >
                  Open in dashboard editor
                </Button>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <div className="flex gap-2">
            <Button
              onClick={() => onOpenChange(false)}
              variant="outline"
              type="button"
            >
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              type="button"
              disabled={!selectionChanged}
              loading={setHomeDashboard.isPending}
            >
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
