import { useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { api } from "@/src/utils/api";
import { LANGFUSE_HOME_DASHBOARD_ID } from "@langfuse/shared";
import { Combobox } from "@/src/components/ui/combobox";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { showErrorToast } from "@/src/features/notifications/showErrorToast";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";

/**
 * Picks which dashboard renders on the project home page
 * (Project.homeDashboardId; null = the Langfuse-curated default).
 */
export function HomeDashboardSelector({
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

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      page: 1,
      limit: 100,
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

  const value = homeDashboardId ?? LANGFUSE_HOME_DASHBOARD_ID;

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

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={(dashboardId) => {
        if (typeof dashboardId !== "string" || dashboardId === value) return;
        setHomeDashboard.mutate({
          projectId,
          dashboardId:
            dashboardId === LANGFUSE_HOME_DASHBOARD_ID ? null : dashboardId,
        });
      }}
      placeholder={currentDashboardName}
      searchPlaceholder="Search dashboards..."
      emptyText="No dashboards found"
      disabled={setHomeDashboard.isPending}
      className="my-0 w-auto max-w-56"
      name="home-dashboard"
    />
  );
}
