import { useRouter } from "next/router";

import Page from "@/src/components/layouts/page";
import { Skeleton } from "@/src/components/ui/skeleton";
import { MonitorForm } from "@/src/features/monitors/components/MonitorForm";
import { MonitorPagePermissions } from "@/src/features/monitors/components/MonitorPagePermissions";
import { getInitialMonitorTriggerIds } from "@/src/features/monitors/fns/getInitialMonitorTriggerIds";
import { getMonitorPrefill } from "@/src/features/monitors/fns/getMonitorPrefill";
import { api } from "@/src/utils/api";
import { TriggerEventSource } from "@langfuse/shared";

const alertAnalyticsSource = (alert: string | string[] | undefined) => {
  switch (alert) {
    case "evaluatorScore":
      return "evaluator_score" as const;
    case "evaluatorCost":
      return "evaluator_cost" as const;
    case "allEvaluatorCost":
      return "all_evaluator_cost" as const;
    default:
      return "alerts" as const;
  }
};

/** NewMonitorPage renders the create-monitor form for a project. */
export default function NewMonitorPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const prefill = router.isReady ? getMonitorPrefill(router.query) : undefined;
  const analyticsSource = alertAnalyticsSource(router.query.alert);
  const automations = api.automations.getAutomations.useQuery(
    { projectId, eventSource: TriggerEventSource.Monitor },
    {
      enabled: Boolean(router.isReady && projectId),
      trpc: { context: { skipBatch: true } },
      refetchOnWindowFocus: false,
    },
  );
  const initialTriggerIds = getInitialMonitorTriggerIds(automations.data ?? []);

  return (
    <MonitorPagePermissions scope="alerts:CUD">
      <Page
        withPadding
        headerProps={{
          title: "New Alert",
          breadcrumb: [
            { name: "Alerts", href: `/project/${projectId}/alerts` },
          ],
        }}
      >
        {router.isReady && !automations.isPending ? (
          <MonitorForm
            projectId={projectId}
            prefill={prefill}
            analyticsSource={analyticsSource}
            initialTriggerIds={initialTriggerIds}
          />
        ) : (
          <Skeleton className="h-96 w-full" />
        )}
      </Page>
    </MonitorPagePermissions>
  );
}
