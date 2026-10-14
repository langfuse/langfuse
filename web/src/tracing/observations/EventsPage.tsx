import React from "react";
import { useRouter } from "next/router";
import ObservationsEventsTable from "@/src/tracing/observations/components/EventsTable";
import Page from "@/src/app/shell/layouts/page";
import { api } from "@/src/app/utils/api";
import { TracesOnboarding } from "@/src/app/onboarding/shared-components/TracesOnboarding";
import { getTracingTabs, TRACING_TABS } from "@/src/app/shell/navigation";
import { useQueryProject } from "@/src/identity/projects";

export default function EventsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { project } = useQueryProject();

  // Check if the user has tracing configured
  // Skip polling entirely if the project flag is already set in the session
  const { data: hasTracingConfigured, isLoading } =
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

  const showOnboarding = !isLoading && !hasTracingConfigured;

  return (
    <Page
      headerProps={{
        title: "Tracing - Events Table (New)",
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
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no traces */}
      {showOnboarding ? (
        <TracesOnboarding projectId={projectId} />
      ) : (
        <ObservationsEventsTable
          projectId={projectId}
          showControlsInPageHeader
        />
      )}
    </Page>
  );
}
