import { useRouter } from "next/router";
import SessionsTable from "@/src/components/table/use-cases/sessions";
import Page from "@/src/components/layouts/page";
import { SessionsOnboarding } from "@/src/features/onboarding/components/SessionsOnboarding";
import { api } from "@/src/utils/api";

export default function Sessions() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  const { data: hasAnySession, isLoading } = api.sessions.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      refetchOnWindowFocus: false,
    },
  );

  const showOnboarding = !isLoading && !hasAnySession;

  return (
    <Page
      headerProps={{
        title: "Sessions",
        help: {
          description:
            "A session is a collection of related traces, such as a conversation or thread. To begin, add a sessionId to the trace.",
          href: "https://langfuse.com/docs/sessions",
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
