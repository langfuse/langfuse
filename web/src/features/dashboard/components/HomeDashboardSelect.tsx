import { useMemo } from "react";
import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/src/utils/api";
import { Combobox } from "@/src/components/ui/combobox";
import { LangfuseIcon } from "@/src/components/design-system/LangfuseIcon/LangfuseIcon";
import { Button } from "@/src/components/ui/button";
import { useHasProjectAccess } from "@/src/features/rbac";
import { getManagedDashboardMessageKey } from "@/src/features/dashboard/lib/managed-dashboard-localization";

/**
 * Home's dashboard picker: selecting immediately shows ("peeks") the chosen
 * dashboard on Home without changing anything for the project. Persisting it
 * as the project default is a separate, explicit "Set default" action owned
 * by the Home page.
 */
export function HomeDashboardSelect({
  projectId,
  value,
  defaultDashboardId,
  onValueChange,
  currentDashboardName,
  currentDashboardOwner,
}: {
  projectId: string;
  /** Id of the dashboard currently displayed on Home. */
  value: string;
  /** The project's persisted default (pointer or the curated fallback). */
  defaultDashboardId: string;
  onValueChange: (dashboardId: string) => void;
  currentDashboardName: string;
  currentDashboardOwner: "LANGFUSE" | "PROJECT";
}) {
  const t = useTranslations("playgroundDashboard.dashboard.homeSelect");
  const managedDashboardT = useTranslations(
    "systemUi.dashboardExtras.managedDashboards",
  );
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

  const currentDashboardMessageKey = getManagedDashboardMessageKey({
    id: value,
    name: currentDashboardName,
    owner: currentDashboardOwner,
  });
  const localizedCurrentDashboardName = currentDashboardMessageKey
    ? managedDashboardT(`${currentDashboardMessageKey}.name`)
    : currentDashboardName;

  const options = useMemo(() => {
    const items = dashboards.data?.dashboards ?? [];
    const toOption = (d: { id: string; name: string; owner: string }) => {
      const messageKey = getManagedDashboardMessageKey(d);
      return {
        value: d.id,
        label: messageKey ? managedDashboardT(`${messageKey}.name`) : d.name,
        ...(d.owner === "LANGFUSE" ? { icon: <LangfuseIcon size={14} /> } : {}),
        ...(d.id === defaultDashboardId ? { badge: t("default") } : {}),
      };
    };
    const curated = items.filter((d) => d.owner === "LANGFUSE");
    const project = items.filter((d) => d.owner === "PROJECT");
    return [
      ...(project.length > 0
        ? [
            {
              heading: t("thisProject"),
              options: project.map(toOption),
            },
          ]
        : []),
      {
        heading: t("maintained"),
        options: curated.map(toOption),
      },
    ];
  }, [dashboards.data?.dashboards, defaultDashboardId, managedDashboardT, t]);

  if (!hasCUDAccess) {
    return (
      <Button
        variant="ghost"
        disabled
        title={t("description")}
        className="text-muted-foreground my-0"
      >
        <LayoutDashboard className="mr-1 h-4 w-4" />
        {localizedCurrentDashboardName}
      </Button>
    );
  }

  return (
    <Combobox
      options={options}
      value={value}
      onValueChange={(id) => {
        if (typeof id !== "string" || id === value) return;
        onValueChange(id);
      }}
      placeholder={localizedCurrentDashboardName}
      searchPlaceholder={t("search")}
      emptyText={t("noneFound")}
      className="my-0 w-auto max-w-56"
      name="home-dashboard"
    />
  );
}
