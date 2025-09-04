import React from "react";
import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";
import {
  getTracingTabs,
  TRACING_TABS,
} from "@/src/features/navigation/utils/tracing-tabs";

export default function Traces() {
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
        title: "トレーシング",
        help: {
          description:
            "トレースは単一の関数/API呼び出しを表します。トレースには観察が含まれます。詳細はドキュメントをご確認ください。",
          href: "https://langfuse.com/docs/tracing-data-model",
        },
        tabsProps: {
          tabs: getTracingTabs(projectId),
          activeTab: TRACING_TABS.TRACES,
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no traces */}
      {showOnboarding ? (
        <TracesOnboarding projectId={projectId} />
      ) : (
        <TracesTable projectId={projectId} />
      )}
    </Page>
  );
}
