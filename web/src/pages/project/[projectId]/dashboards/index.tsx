import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { DashboardTable } from "@/src/features/dashboard/components/DashboardTable";
import { ActionButton } from "@/src/components/ActionButton";
import { PlusIcon } from "lucide-react";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import {
  getDashboardTabs,
  DASHBOARD_TABS,
} from "@/src/features/navigation/utils/dashboard-tabs";
import { useTranslation } from "react-i18next";

export default function Dashboards() {
  const { t } = useTranslation();
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
        title: t("dashboard.pages.title"),
        help: {
          description: t("dashboard.pages.description"),
          href: "https://langfuse.com/docs/metrics/features/custom-dashboards",
        },
        tabsProps: {
          tabs: getDashboardTabs(projectId),
          activeTab: DASHBOARD_TABS.DASHBOARDS,
        },
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
            {t("dashboard.actions.newDashboard")}
          </ActionButton>
        ),
      }}
    >
      <DashboardTable />
    </Page>
  );
}
