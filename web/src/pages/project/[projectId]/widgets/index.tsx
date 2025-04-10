import { useRouter } from "next/router";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import Page from "@/src/components/layouts/page";
import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "lucide-react";
import { DashboardWidgetTable } from "@/src/features/widgets";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import Link from "next/link";

export default function Widgets() {
  const router = useRouter();
  const { projectId } = router.query as { projectId: string };
  const capture = usePostHogClientCapture();
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
          href: "https://langfuse.com/docs/analytics/custom-dashboards",
        },
        tabsComponent: (
          <TabsBar value="widgets">
            <TabsBarList>
              <TabsBarTrigger value="dashboards" asChild>
                <Link href={`/project/${projectId}/dashboards`}>
                  Dashboards
                </Link>
              </TabsBarTrigger>
              <TabsBarTrigger value="widgets">Widgets</TabsBarTrigger>
            </TabsBarList>
          </TabsBar>
        ),
        actionButtonsRight: (
          <ActionButton
            icon={<PlusIcon className="h-4 w-4" aria-hidden="true" />}
            hasAccess={hasCUDAccess}
            href={`/project/${projectId}/widgets/new`}
            variant="default"
            onClick={() => {
              capture("dashboard:new_widget_form_open");
            }}
          >
            New widget
          </ActionButton>
        ),
      }}
    >
      <DashboardWidgetTable />
    </Page>
  );
}
