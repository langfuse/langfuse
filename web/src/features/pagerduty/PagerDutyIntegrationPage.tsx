import { useRouter } from "next/router";

import ContainerPage from "@/src/components/layouts/ContainerPage";
import { RouteParamsPendingFallback } from "@/src/components/RouteParamsPendingFallback/RouteParamsPendingFallback";
import { StatusBadge } from "@/src/components/ui/StatusBadge/StatusBadge";
import { AutomationButton } from "@/src/features/automations";
import { PagerDutyIntegrationsTable } from "@/src/features/pagerduty/components/PagerDutyIntegrationsTable";
import { usePagerDutyIntegrations } from "@/src/features/pagerduty/usePagerDutyIntegrations";

/** PagerDutyIntegrationPage manages the PagerDuty routing keys automations send alerts to. */
export default function PagerDutyIntegrationPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string | undefined;
  const { status } = usePagerDutyIntegrations(projectId);

  if (!projectId) {
    return <RouteParamsPendingFallback />;
  }

  return (
    <ContainerPage
      headerProps={{
        title: "PagerDuty Integration",
        breadcrumb: [
          { name: "Settings", href: `/project/${projectId}/settings` },
        ],
        actionButtonsLeft: status && <StatusBadge type={status} />,
        actionButtonsRight: <AutomationButton projectId={projectId} />,
      }}
    >
      <p className="text-primary mb-4 text-sm">
        Connect PagerDuty services to page your on-call team from monitor alerts
        and project notifications, and to record prompt changes as PagerDuty
        change events. Langfuse only sends events to PagerDuty.
      </p>
      <PagerDutyIntegrationsTable projectId={projectId} />
    </ContainerPage>
  );
}
