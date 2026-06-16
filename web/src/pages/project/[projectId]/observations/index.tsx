import React, { useState } from "react";
import { useRouter } from "next/router";
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
import { useSearchBarEnabled } from "@/src/features/search-bar/hooks/useSearchBarEnabled";

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isBetaEnabled, isInitializing } = useV4Beta();
  const { project } = useQueryProject();
  // The header-actions slot only has a consumer when the bar is actually
  // active (admin + project opted in), so gate it the same way the table gates
  // searchBarMode — otherwise it's a dead empty node in the header.
  const { isEnabled: searchBarEnabled, canToggle: canUseSearchBar } =
    useSearchBarEnabled();
  const searchBarActive = isBetaEnabled && searchBarEnabled && canUseSearchBar;
  // Host for the events table's time-range + refresh controls, rendered into
  // the page header (which is otherwise under-utilized). The events table
  // portals into this node when the search bar is active.
  const [headerActions, setHeaderActions] = useState<HTMLElement | null>(null);

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
        // Only render the portal target when its sole consumer
        // (ObservationsEventsTable) actually mounts — i.e. not during onboarding
        // or the pre-beta-flag init window, where the slot would otherwise be a
        // dead, empty <div> with a callback ref that never receives a portal.
        actionButtonsRight:
          searchBarActive && !showOnboarding && !isInitializing ? (
            <div ref={setHeaderActions} className="flex items-center gap-2" />
          ) : undefined,
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
          headerActionsContainer={headerActions}
        />
      ) : (
        <ObservationsTable projectId={projectId} />
      )}
    </Page>
  );
}
