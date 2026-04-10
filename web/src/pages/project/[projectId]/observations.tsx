import React, { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useQueryParams, StringParam } from "use-query-params";
import ObservationsTable from "@/src/components/table/use-cases/observations";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import { useQueryProject } from "@/src/features/projects/hooks";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isBetaEnabled, isInitializing } = useV4Beta();
  const [, setQueryParams] = useQueryParams({ viewId: StringParam });
  const { project } = useQueryProject();
  const previousBetaEnabledRef = useRef<boolean | null>(null);
  const viewPersistenceKey = isBetaEnabled
    ? "observations-v4"
    : "observations-v3";

  // Clear viewId when switching between table modes
  useEffect(() => {
    if (isInitializing) {
      return;
    }

    const previousIsBetaEnabled = previousBetaEnabledRef.current;
    previousBetaEnabledRef.current = isBetaEnabled;

    const didTableModeChange =
      previousIsBetaEnabled !== null && previousIsBetaEnabled !== isBetaEnabled;

    if (!didTableModeChange) {
      return;
    }

    setQueryParams({ viewId: undefined });
  }, [isBetaEnabled, isInitializing, setQueryParams]);

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
        title: "Tracing",
        help: {
          description:
            "An observation captures a single function call in an application. See docs to learn more.",
          href: "https://langfuse.com/docs/observability/data-model",
        },
        tabsProps:
          isBetaEnabled || isInitializing
            ? undefined
            : {
                tabs: getTracingTabs(projectId),
                activeTab: TRACING_TABS.OBSERVATIONS,
              },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no traces */}
      {showOnboarding ? (
        <TracesOnboarding projectId={projectId} />
      ) : isInitializing ? (
        <>
          {/* Wait for the beta flag before mounting either table. Otherwise the
              legacy table can briefly mount, restore a v3 saved view, and
              promote its viewId into the URL before the correct mode
              resolves. */}
        </>
      ) : isBetaEnabled ? (
        <ObservationsEventsTable
          projectId={projectId}
          viewPersistenceKey={viewPersistenceKey}
        />
      ) : (
        <ObservationsTable
          projectId={projectId}
          viewPersistenceKey={viewPersistenceKey}
        />
      )}
    </Page>
  );
}
