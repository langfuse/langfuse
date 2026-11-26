import { useMemo } from "react";
import { api } from "@/src/utils/api";
import { HomeDashboardSelect } from "./HomeDashboardSelect";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";

/**
 * Home's dashboard picker: selecting immediately shows ("peeks") the chosen
 * dashboard on Home without changing anything for the project. Persisting it
 * as the project default is a separate, explicit "Set default" action owned
 * by the Home page.
 */
export function ConnectedHomeDashboardSelect({
  projectId,
  value,
  defaultDashboardId,
  onValueChange,
  currentDashboardName,
}: {
  projectId: string;
  /** Id of the dashboard currently displayed on Home. */
  value: string;
  /** The project's persisted default (pointer or the curated fallback). */
  defaultDashboardId: string;
  onValueChange: (dashboardId: string) => void;
  currentDashboardName: string;
}) {
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  const dashboards = api.dashboard.allDashboards.useQuery(
    {
      projectId,
      page: 1,
      limit: 500,
      orderBy: { column: "name", order: "ASC" },
    },
    { enabled: Boolean(projectId) && hasCUDAccess },
  );

  const options = useMemo(() => {
    const items = dashboards.data?.dashboards ?? [];
    const toOption = (d: { id: string; name: string }) => ({
      value: d.id,
      label: d.name,
      ...(d.id === defaultDashboardId ? { badges: [{ text: "default" }] } : {}),
    });
    const curated = items.filter((d) => d.owner === "LANGFUSE");
    const project = items.filter((d) => d.owner === "PROJECT");
    return [
      ...(project.length > 0
        ? [
            {
              type: "group" as const,
              id: "project",
              label: "This project",
              options: project.map(toOption),
            },
          ]
        : []),
      {
        type: "group" as const,
        id: "langfuse",
        label: "Langfuse-maintained",
        options: curated.map(toOption),
      },
    ];
  }, [dashboards.data?.dashboards, defaultDashboardId]);

  if (!hasCUDAccess) {
    return (
      <Button
        variant="ghost"
        disabled
        title="The dashboard shown on this project's home page"
        className="text-muted-foreground my-0"
      >
        {currentDashboardName}
      </Button>
    );
  }

  return (
    <HomeDashboardSelect
      options={options}
      value={value}
      onValueChange={onValueChange}
      currentDashboardName={currentDashboardName}
    />
  );
}
