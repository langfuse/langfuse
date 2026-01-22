import React, { useEffect, useRef } from "react";
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
import { useObservationListBeta } from "@/src/features/events/hooks/useObservationListBeta";
import ObservationsEventsTable from "@/src/features/events/components/EventsTable";
import { Switch } from "@/src/components/ui/switch";
import { Label } from "@/src/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { data: session } = useSession();
  const { isBetaEnabled, setBetaEnabled } = useObservationListBeta();
  const hasAppliedDefaultFilter = useRef(false);

  // TODO: remove for prod go-live
  const showBetaToggle = session?.user?.email?.endsWith("@langfuse.com");

  // Apply default filter when beta is enabled on traces page
  useEffect(() => {
    if (!isBetaEnabled || !projectId) return;

    // Only apply on fresh navigation (not on back button)
    if (hasAppliedDefaultFilter.current) return;
    hasAppliedDefaultFilter.current = true;

    const currentFilter = router.query.filter as string | undefined;
    if (currentFilter?.includes("hasParentObservation")) return;

    // Apply default filter: hasParentObservation = false
    const defaultFilter = "hasParentObservation;boolean;;=;false";
    const newFilter = currentFilter
      ? `${currentFilter},${defaultFilter}`
      : defaultFilter;

    void router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, filter: newFilter },
      },
      undefined,
      { shallow: true },
    );
  }, [isBetaEnabled, projectId, router]);

  // Reset ref on beta toggle or unmount
  useEffect(() => {
    if (!isBetaEnabled) hasAppliedDefaultFilter.current = false;
  }, [isBetaEnabled]);

  // Check if the user has tracing configured
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
        refetchInterval: 10_000,
      },
    );

  const showOnboarding = !isLoading && !hasTracingConfigured;

  const betaToggle = showBetaToggle ? (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-2">
            <Switch
              id="beta-toggle"
              checked={isBetaEnabled}
              onCheckedChange={setBetaEnabled}
            />
            <Label htmlFor="beta-toggle" className="cursor-pointer text-xs">
              Beta
            </Label>
          </div>
        </TooltipTrigger>
        <TooltipContent>
          Try the new unified observations view powered by the events table
          <p>Try the high performance events based observation view</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  if (showOnboarding) {
    return (
      <Page
        headerProps={{
          title: "Tracing",
          help: {
            description:
              "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
            href: "https://langfuse.com/docs/observability/data-model",
          },
          actionButtonsLeft: betaToggle,
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
          description:
            "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
          href: "https://langfuse.com/docs/observability/data-model",
        },
        actionButtonsLeft: betaToggle,
        tabsProps: isBetaEnabled
          ? undefined
          : {
              tabs: getTracingTabs(projectId),
              activeTab: TRACING_TABS.TRACES,
            },
      }}
    >
      {isBetaEnabled ? (
        <ObservationsEventsTable projectId={projectId} />
      ) : (
        <TracesTable projectId={projectId} />
      )}
    </Page>
  );
}
