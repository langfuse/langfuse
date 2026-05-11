import React from "react";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import Page from "@/src/components/layouts/page";
import { NoDataOrLoading } from "@/src/components/NoDataOrLoading";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useV4Beta } from "@/src/features/events/hooks/useV4Beta";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import { useQueryProject } from "@/src/features/projects/hooks";
import { StarterProjectInvitePrompt } from "@/src/features/onboarding/components/StarterProjectInvitePrompt";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isBetaEnabled, isInitializing } = useV4Beta();
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
          title: "Tracing",
        }}
      >
        <NoDataOrLoading isLoading />
      </Page>
    );
  }

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
        <StarterProjectInvitePrompt />
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
      <StarterProjectInvitePrompt />
      {isInitializing ? (
        <>
          {/* Wait for the beta flag before mounting either table. Otherwise the
              legacy table can briefly mount, restore a v3 saved view, and
              promote its viewId into the URL before the correct mode
              resolves. */}
        </>
      ) : isBetaEnabled ? (
        <ObservationsEventsTable projectId={projectId} />
      ) : (
        <TracesTable projectId={projectId} />
      )}
    </Page>
  );
}
