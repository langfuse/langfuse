import React from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import ObservationsTable from "@/src/components/table/use-cases/observations";
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

export default function Generations() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { data: session } = useSession();
  const { isBetaEnabled, setBetaEnabled } = useObservationListBeta();

  // TODO: remove for prod go-live
  const showBetaToggle = session?.user?.email?.endsWith("@langfuse.com");

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
          <p>Try the high performance events based observation view</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  ) : null;

  return (
    <Page
      headerProps={{
        title: "Tracing",
        help: {
          description:
            "An observation captures a single function call in an application. See docs to learn more.",
          href: "https://langfuse.com/docs/observability/data-model",
        },
        actionButtonsLeft: betaToggle,
        tabsProps: isBetaEnabled
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
      ) : isBetaEnabled ? (
        <ObservationsEventsTable projectId={projectId} />
      ) : (
        <ObservationsTable projectId={projectId} />
      )}
    </Page>
  );
}
