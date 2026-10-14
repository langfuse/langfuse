/* eslint-disable no-nested-ternary */
import { useRouter } from "next/router";
import { ObservationsTable } from "@/src/tracing/legacy-tables";
import Page from "@/src/app/shell/layouts/page";
import { api } from "@/src/app/utils/api";
import { TracesOnboarding } from "@/src/app/onboarding/shared-components/TracesOnboarding";
import { getTracingTabs, TRACING_TABS } from "@/src/app/shell/navigation";
import { useReadPath } from "@/src/tracing/observations";
import ObservationsEventsTable from "@/src/tracing/observations/components/EventsTable";
import { useQueryProject } from "@/src/identity/projects";
import { V4MigrationDelayBadge } from "@/src/migrations/v4/upgrade-experience/V4MigrationDelayBadge";

export default function ObservationsPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isV4, isResolved } = useReadPath();
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
        title: "Tracing",
        // Match traces/index.tsx: no delay badge while onboarding tells the
        // user to set up tracing for the first time.
        titleBadges: showOnboarding ? undefined : (
          <V4MigrationDelayBadge page="observations" />
        ),
        help: {
          description:
            "An observation captures a single function call in an application. See docs to learn more.",
          href: "https://langfuse.com/docs/observability/data-model",
        },
        tabsProps:
          isV4 || !isResolved
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
      ) : !isResolved ? (
        <>
          {/* Wait for the beta flag before mounting either table. Otherwise the
              legacy table can briefly mount, restore a v3 saved view, and
              promote its viewId into the URL before the correct mode
              resolves. */}
        </>
      ) : isV4 ? (
        <ObservationsEventsTable
          projectId={projectId}
          showControlsInPageHeader
          enableAppRootDefault
        />
      ) : (
        <ObservationsTable projectId={projectId} showControlsInPageHeader />
      )}
    </Page>
  );
}
