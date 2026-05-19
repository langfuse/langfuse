import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
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
import { CreateProjectMemberButton } from "@/src/features/rbac/components/CreateProjectMemberButton";
import { shouldShowStarterProjectInvitePrompt } from "@/src/features/onboarding/lib/starterProjectMetadata";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { data: session, update: updateSession } = useSession();
  const { isBetaEnabled, isInitializing } = useV4Beta();
  const { project, organization } = useQueryProject();
  const [hasHandledStarterInvitePrompt, setHasHandledStarterInvitePrompt] =
    useState(false);
  const [isConsumingStarterInvitePrompt, setIsConsumingStarterInvitePrompt] =
    useState(false);
  const consumeStarterProjectInvitePrompt =
    api.onboarding.consumeStarterProjectInvitePrompt.useMutation();
  const shouldPromptForStarterProjectInvite =
    !!project &&
    !!organization &&
    !!session?.user &&
    shouldShowStarterProjectInvitePrompt({
      metadata: project.metadata,
      userId: session.user.id,
    });
  const showStarterProjectInvitePrompt =
    shouldPromptForStarterProjectInvite && !hasHandledStarterInvitePrompt;

  useEffect(() => {
    setHasHandledStarterInvitePrompt(false);
    setIsConsumingStarterInvitePrompt(false);
  }, [projectId]);

  const handleConsumeStarterProjectInvitePrompt = async () => {
    if (
      !shouldPromptForStarterProjectInvite ||
      !projectId ||
      isConsumingStarterInvitePrompt
    ) {
      return;
    }

    setIsConsumingStarterInvitePrompt(true);

    try {
      await consumeStarterProjectInvitePrompt.mutateAsync({
        projectId,
      });
      setHasHandledStarterInvitePrompt(true);
      await updateSession();
    } catch (error) {
      console.error(error);
    } finally {
      setIsConsumingStarterInvitePrompt(false);
    }
  };

  const starterProjectInvitePrompt =
    showStarterProjectInvitePrompt && organization && project ? (
      <CreateProjectMemberButton
        orgId={organization.id}
        project={{ id: project.id, name: project.name }}
        hideTrigger
        open={showStarterProjectInvitePrompt}
        onOpenChange={(open) => {
          if (!open) {
            void handleConsumeStarterProjectInvitePrompt();
          }
        }}
      />
    ) : null;

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
        {starterProjectInvitePrompt}
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
      {starterProjectInvitePrompt}
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
