import React from "react";
import { useRouter } from "next/router";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import Page from "@/src/components/layouts/Page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useQueryProject } from "@/src/features/projects/hooks";
import { tracingPageView } from "@/src/features/traces/fns/tracingPageView";

export default function EventsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { project } = useQueryProject();

  // Check if the user has tracing configured
  // Skip polling entirely if the project flag is already set in the session
  const { data: hasTracingConfigured, isPending } =
    api.traces.hasTracingConfigured.useQuery(
      { projectId },
      {
        enabled: !!projectId,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchInterval: project?.hasTraces ? false : 10_000,
        initialData: project?.hasTraces ? true : undefined,
        staleTime: project?.hasTraces ? Infinity : 0,
      },
    );

  const view = tracingPageView({ isPending, hasTracingConfigured });

  return (
    <Page
      headerProps={{
        title: "Tracing - Events Table (New)",
        divider: false,
        help: {
          description:
            "An observation captures a single function call in an application. This view uses the new ClickHouse events table.",
          href: "https://langfuse.com/docs/observability/data-model",
        },
        tabsProps: {
          tabs: getTracingTabs(projectId),
          activeTab: TRACING_TABS.OBSERVATIONS,
        },
      }}
      scrollable={view !== "table"}
    >
      {view === "onboarding" && <TracesOnboarding projectId={projectId} />}
      {view === "table" && (
        <ObservationsEventsTable
          projectId={projectId}
          showControlsInPageHeader
        />
      )}
    </Page>
  );
}
