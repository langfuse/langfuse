import { useRouter } from "next/router";
import TracesTable from "@/src/components/table/use-cases/traces";
import Page from "@/src/components/layouts/page";
import { api } from "@/src/utils/api";
import { TracesOnboarding } from "@/src/components/onboarding/TracesOnboarding";

export default function Traces() {
  const router = useRouter();
  const projectId = router.query.projectId as string;

  // Check if the user has any traces
  const { data: hasAnyTrace, isLoading, isError, error } = api.traces.hasAny.useQuery(
    { projectId },
    {
      enabled: !!projectId,
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchInterval: 10_000,
      retry: (failureCount, error) => {
        // Don't retry on network errors to avoid Sentry spam
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
          return false;
        }
        return failureCount < 3;
      },
    },
  );

  const showOnboarding = !isLoading && !isError && !hasAnyTrace;

  return (
    <Page
      headerProps={{
        title: "Traces",
        help: {
          description:
            "A trace represents a single function/api invocation. Traces contain observations. See docs to learn more.",
          href: "https://langfuse.com/docs/tracing",
        },
      }}
      scrollable={showOnboarding}
    >
      {/* Show onboarding screen if user has no traces */}
      {isError ? (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <h3 className="text-lg font-semibold text-destructive mb-2">
              Failed to load traces
            </h3>
            <p className="text-muted-foreground mb-4">
              {error?.message?.includes('Failed to fetch') 
                ? 'Network connection error. Please check your internet connection and try again.'
                : error?.message || 'An unexpected error occurred while loading traces.'}
            </p>
            <button
              onClick={() => router.reload()}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
            >
              Retry
            </button>
          </div>
        </div>
      ) : showOnboarding ? (
        <TracesOnboarding projectId={projectId} />
      ) : (
        <TracesTable projectId={projectId} />
      )}
    </Page>
  );
}
