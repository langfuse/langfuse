import { useMemo, useState } from "react";
import { LayoutDashboard } from "lucide-react";
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
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

/**
 * Home's only control: pick which dashboard renders on the project home
 * page. Selecting stages the change and asks for confirmation (it applies to
 * everyone in the project); Home itself stays uneditable — editing lives in
 * the Dashboards section.
 */
export function HomeDashboardSelect({
  projectId,
  homeDashboardId,
  currentDashboardName,
}: {
  projectId: string;
  homeDashboardId: string | null;
  currentDashboardName: string;
}) {
  const utils = api.useUtils();
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  // Selection staged for confirmation, not yet applied.
  const [pending, setPending] = useState<{ id: string; name: string } | null>(
    null,
  );

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      page: 1,
      limit: 500,
      orderBy: { column: "name", order: "ASC" },
    },
    { enabled: Boolean(projectId) && hasCUDAccess },
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
      setPending(null);
    },
    onError: (e) => {
      showErrorToast("Failed to update home dashboard", e.message);
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

  const appliedValue = homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID;

  if (!hasCUDAccess) {
    return (
      <Button
        variant="ghost"
        disabled
        title="The dashboard shown on this project's home page"
        className="text-muted-foreground my-0"
      >
        <LayoutDashboard className="mr-1 h-4 w-4" />
        {currentDashboardName}
      </Button>
    );
  }

  const findName = (id: string) => {
    const item = dashboards.data?.dashboards.find((d) => d.id === id);
    return item?.name ?? "this dashboard";
  };

  return (
    <>
      <Combobox
        options={options}
        value={appliedValue}
        onValueChange={(id) => {
          if (typeof id !== "string" || id === appliedValue) return;
          setPending({ id, name: findName(id) });
        }}
        placeholder={currentDashboardName}
        searchPlaceholder="Search dashboards..."
        emptyText="No dashboards found"
        className="my-0 w-auto max-w-56"
        name="home-dashboard"
      />
      <Dialog
        open={Boolean(pending)}
        onOpenChange={(open) => {
          if (!open && !setHomeDashboard.isPending) setPending(null);
        }}
      >
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Change Home dashboard</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className="text-muted-foreground py-4 text-sm">
              Show{" "}
              <span className="text-foreground font-medium">
                &ldquo;{pending?.name}&rdquo;
              </span>{" "}
              on Home instead of &ldquo;{currentDashboardName}&rdquo;? This
              changes the home page for everyone in this project.
            </p>
          </DialogBody>
          <DialogFooter>
            <div className="flex gap-2">
              <Button
                onClick={() => setPending(null)}
                variant="outline"
                type="button"
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!pending) return;
                  setHomeDashboard.mutate({
                    projectId,
                    dashboardId:
                      pending.id === LANGFUSE_HOME_DASHBOARD_ID
                        ? null
                        : pending.id,
                  });
                }}
                type="button"
                loading={setHomeDashboard.isPending}
              >
                Set as Home
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
