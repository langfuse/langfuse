import React from "react";
import { useRouter } from "next/router";
import ObservationsTable from "@/src/components/table/use-cases/observations";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";
import { useTranslation } from "react-i18next";

export default function Generations() {
  const { t } = useTranslation();
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the user has any traces
  const { data: hasAnyTrace, isLoading } = api.traces.hasAny.useQuery(
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

  const showOnboarding = !isLoading && !hasAnyTrace;

  return (
    <Page
      headerProps={{
        title: t("tracing.observation.pages.title"),
        help: {
          description: t("tracing.observation.pages.description"),
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
        <ObservationsTable projectId={projectId} />
      )}
    </Page>
  );
}
