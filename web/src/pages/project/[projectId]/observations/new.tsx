import React from "react";
import { useRouter } from "next/router";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useQueryProject } from "@/src/features/projects/hooks";

export default function Events() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { project } = useQueryProject();
  const hasRetentionConfigured = Boolean(
    project?.retentionDays && project.retentionDays > 0,
  );
  const initialHasTracingConfigured =
    project?.hasTraces || hasRetentionConfigured ? true : undefined;

  // Check if the user has tracing configured
  // Skip polling entirely if the project flag is already set in the session
  const { data: hasTracingConfigured } =
    api.traces.hasTracingConfigured.useQuery(
      { projectId },
      {
        enabled: !!projectId,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        meta: {
          silentHttpCodes: [500, 503],
        },
        refetchInterval: project?.hasTraces ? false : 10_000,
        initialData: initialHasTracingConfigured,
        staleTime: project?.hasTraces ? Infinity : 0,
      },
    );

  const showOnboarding = hasTracingConfigured === false;

  if (hasTracingConfigured === undefined) {
    return (
      <Page
        headerProps={{
          title: "Tracing - Events Table (New)",
        }}
      >
        <NoDataOrLoading isLoading />
      </Page>
    );
  }

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
        <ObservationsEventsTable projectId={projectId} />
      )}
    </Page>
  );
}
