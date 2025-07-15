import React from "react";
import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import Page from "@/src/components/layouts/page";
import { SessionsOnboarding } from "@/src/components/onboarding/SessionsOnboarding";
import { api } from "@/src/utils/api";
import {
  getTracingTabs,
  TRACING_TABS,
  useTracingTabLocalStorage,
} from "@/src/features/navigation/utils/tracing-tabs";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const [, setActiveTab] = useTracingTabLocalStorage();

  const { data: hasAnySession, isLoading } = api.sessions.hasAny.useQuery(
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

  const showOnboarding = !isLoading && !hasAnySession;

  // Update local storage when this page loads
  React.useEffect(() => {
    setActiveTab(TRACING_TABS.SESSIONS);
  }, [setActiveTab]);

  return (
    <Page
      headerProps={{
        title: "Tracing",
        help: {
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
        },
        tabsProps: {
          tabs: getTracingTabs(projectId),
          activeTab: TRACING_TABS.SESSIONS,
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no sessions */}
      {showOnboarding ? (
        <SessionsOnboarding />
      ) : (
        <SessionsTable projectId={projectId} />
      )}
    </Page>
  );
}
