import React, { useState } from "react";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
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

export default function Traces() {
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
  // Host for the events table's time-range + refresh controls in the page
  // header (the events table is shown here in v4 mode and portals into it).
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

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Tracing",
          help: {
            description:
              "A trace represents a single function/api invocation. Traces contain observations. See [docs](https://langfuse.com/docs/observability/data-model) to learn more.",
            href: "https://langfuse.com/docs/observability/data-model",
          },
        }}
        scrollable
      >
        <TracesOnboarding projectId={projectId} />
      </Page>
    );
  }

  return (
    <Page
      headerProps={{
        title: "Tracing",
        help: {
          description: (
            <>
              A trace represents a single function/api invocation. Traces
              contain observations. See{" "}
              <a
                href="https://langfuse.com/docs/observability/data-model"
                target="_blank"
                rel="noopener noreferrer"
                className="decoration-primary/30 hover:decoration-primary underline"
                onClick={(e) => e.stopPropagation()}
              >
                docs
              </a>{" "}
              to learn more.
            </>
          ),
          href: "https://langfuse.com/docs/observability/data-model",
        },
        // Mirror observations/index.tsx: only mount the portal target when its
        // consumer (the events table) does. Onboarding is handled by the early-
        // return Page above; the remaining window to guard is the pre-beta-flag
        // init transient.
        actionButtonsRight:
          searchBarActive && !isInitializing ? (
            <div ref={setHeaderActions} className="flex items-center gap-2" />
          ) : undefined,
        tabsProps:
          isBetaEnabled || isInitializing
            ? undefined
            : {
                tabs: getTracingTabs(projectId),
                activeTab: TRACING_TABS.TRACES,
              },
      }}
    >
      {isInitializing ? (
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
        <TracesTable projectId={projectId} />
      )}
    </Page>
  );
}
