import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { DashboardTable } from "@/src/features/dashboard/components/DashboardTable";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import Link from "next/link";
import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

export default function Dashboards() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  const capture = usePostHogClientCapture();
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
          href: "https://langfuse.com/docs/analytics/custom-dashboards",
        },
        tabsComponent: (
          <TabsBar value="dashboards">
            <TabsBarList>
              <TabsBarTrigger value="dashboards">Dashboards</TabsBarTrigger>
              <TabsBarTrigger value="widgets" asChild>
                <Link href={`/project/${projectId}/widgets`}>Widgets</Link>
              </TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
          <ActionButton
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/dashboards/new`}
            variant="default"
            onClick={() => {
              capture("dashboard:new_dashboard_form_open");
            }}
          >
            New dashboard
          </ActionButton>
        ),
      }}
    >
      <DashboardTable />
    </Page>
  );
}
