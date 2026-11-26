import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { useRouter } from "next/router";
import Link from "next/link";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import Page from "@/src/components/layouts/Page";
import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "@langfuse/icons";
import { ConnectedDashboardWidgetTable } from "@/src/features/widgets/components/WidgetTable/ConnectedDashboardWidgetTable";
import {
  getDashboardTabs,
  DASHBOARD_TABS,
} from "@/src/features/navigation/utils/dashboard-tabs";

export default function WidgetsPage() {
  const router = useRouter();
  const authoring = useIsFeatureEnabled("dashboardBlockAuthoring");
  const { projectId } = router.query as { projectId: string };
  const hasCUDAccess = useHasProjectAccess({
    projectId,
    scope: "dashboards:CUD",
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
          <>
            {process.env.NODE_ENV === "development" && (
              <Link
                className="text-muted-foreground px-2 text-sm underline"
                href={`/project/${projectId}/dashboards/debug`}
              >
                Inspect structure
              </Link>
            )}
            {authoring && (
              <ActionButton
                icon={
                  <PlusIcon size="base" color="default" aria-hidden="true" />
                }
                hasAccess={hasCUDAccess}
                href={`/project/${projectId}/widgets/new?kind=markdown`}
                trackingEventName="dashboard:new_widget_form_open"
                trackingProps={{ kind: "markdown" }}
                variant="outline"
              >
                New text
              </ActionButton>
            )}
            <ActionButton
              icon={<PlusIcon size="base" color="default" aria-hidden="true" />}
              hasAccess={hasCUDAccess}
              href={`/project/${projectId}/widgets/new`}
              trackingEventName="dashboard:new_widget_form_open"
              variant="default"
            >
              {authoring ? "New chart" : "New widget"}
            </ActionButton>
          </>
        ),
      }}
    >
      <ConnectedDashboardWidgetTable />
    </Page>
  );
}
