import React, { useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useQueryParams, StringParam } from "use-query-params";
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

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isBetaEnabled, isInitializing } = useV4Beta();
  const [, setQueryParams] = useQueryParams({
    viewId: StringParam,
    viewMode: StringParam,
  });
  const { project } = useQueryProject();
  const previousBetaEnabledRef = useRef<boolean | null>(null);
  const viewPersistenceKey = isBetaEnabled ? "traces-v4" : "traces-v3";

  // Clear mode-specific query state when switching table modes
  useEffect(() => {
    if (isInitializing) {
      return;
    }

    const previousIsBetaEnabled = previousBetaEnabledRef.current;
    previousBetaEnabledRef.current = isBetaEnabled;

    if (previousIsBetaEnabled === null) {
      if (!isBetaEnabled) {
        setQueryParams({ viewMode: undefined });
      }
      return;
    }

    if (previousIsBetaEnabled === isBetaEnabled) {
      return;
    }

    if (!isBetaEnabled) {
      setQueryParams({ viewId: undefined, viewMode: undefined });
    } else {
      setQueryParams({ viewId: undefined });
    }
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
          viewPersistenceKey={viewPersistenceKey}
        />
      ) : (
        <TracesTable
          projectId={projectId}
          viewPersistenceKey={viewPersistenceKey}
        />
      )}
    </Page>
  );
}
