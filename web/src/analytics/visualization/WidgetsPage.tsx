import { useRouter } from "next/router";
import { useHasProjectAccess } from "@/src/identity/access-control";
import Page from "@/src/app/shell/layouts/page";
import { ActionButton } from "@/src/app/components/ActionButton";
import { PlusIcon } from "lucide-react";
import { ConnectedDashboardWidgetTable } from "@/src/analytics/visualization";
import { getDashboardTabs, DASHBOARD_TABS } from "@/src/app/shell/navigation";

export default function WidgetsPage() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "prompts:CUD",
  });

  return (
    <Page
      headerProps={{
        title: "Widgets",
        help: {
          description: "Manage and create widgets for your dashboard.",
          href: "https://langfuse.com/docs/metrics/features/custom-dashboards",
        },
        tabsProps: {
          tabs: getDashboardTabs(projectId),
          activeTab: DASHBOARD_TABS.WIDGETS,
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
            href={`/project/${projectId}/widgets/new`}
            trackingEventName="dashboard:new_widget_form_open"
            variant="default"
          >
            New widget
          </ActionButton>
        ),
      }}
    >
      <ConnectedDashboardWidgetTable />
    </Page>
  );
}
