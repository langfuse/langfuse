import { useRouter } from "next/router";
import Page from "@/src/app/shell/layouts/page";
import { ConnectedDashboardTable } from "@/src/analytics/dashboards/components/DashboardTable/ConnectedDashboardTable";
import { ActionButton } from "@/src/app/components/ActionButton";
import { PlusIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/identity/access-control";
import { getDashboardTabs, DASHBOARD_TABS } from "@/src/app/shell/navigation";

export default function DashboardsPage() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
  });

  return (
    <Page
      headerProps={{
        title: "Dashboards",
        help: {
          description: "Manage and create dashboards for your project.",
          href: "https://langfuse.com/docs/metrics/features/custom-dashboards",
        },
        tabsProps: {
          tabs: getDashboardTabs(projectId),
          activeTab: DASHBOARD_TABS.DASHBOARDS,
        },
        actionButtonsRight: (
          <ActionButton
            icon={
              <PlusIcon
                className="icon-base text-icon-foreground"
                aria-hidden="true"
              />
            }
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/dashboards/new`}
            trackingEventName="dashboard:new_dashboard_form_open"
            variant="default"
          >
            New dashboard
          </ActionButton>
        ),
      }}
    >
      <ConnectedDashboardTable />
    </Page>
  );
}
