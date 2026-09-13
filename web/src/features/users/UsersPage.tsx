import { useRouter } from "next/router";
import Page from "@/src/components/layouts/page";
import { UsersOnboarding } from "@/src/components/onboarding/UsersOnboarding";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { api } from "@/src/utils/api";
import { UsersTable } from "@/src/features/users/UsersTable";

export default function UsersPage() {
  const router = useRouter();
  const projectId = router.query.projectId as string;
  const { isV4 } = useReadPath();

  // Check if the user has any users
  const { data: hasAnyUser, isLoading } = api.users.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId && !isV4,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
    },
  );

  const { data: hasAnyUserFromEvents, isLoading: isLoadingFromEvents } =
    api.users.hasAnyFromEvents.useQuery(
      { projectId },
      {
        enabled: !!projectId && isV4,
        trpc: {
          context: {
            skipBatch: true,
          },
        },
        refetchInterval: 10_000,
      },
    );

  const hasUsers = isV4 ? hasAnyUserFromEvents : hasAnyUser;
  const isLoadingUsers = isV4 ? isLoadingFromEvents : isLoading;
  const showOnboarding = !isLoadingUsers && !hasUsers;

  return (
    <Page
      headerProps={{
        title: "Users",
        help: {
          description: (
            <>
              Attribute data in Langfuse to a user by adding a userId to your
              traces. See{" "}
              <a
                href="https://langfuse.com/docs/observability/features/users"
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
          href: "https://langfuse.com/docs/observability/features/users",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no users */}
      {showOnboarding ? (
        <UsersOnboarding />
      ) : (
        <UsersTable isV4={isV4} showControlsInPageHeader />
      )}
    </Page>
  );
}

