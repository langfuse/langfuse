import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { api } from "@/src/utils/api";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { ErrorPage } from "@/src/components/error-page";
import { DeleteTraceButton } from "@/src/components/deleteButton";
import Page from "@/src/components/layouts/page";
import { Trace } from "@/src/components/trace";
import { TagTraceDetailsPopover } from "@/src/features/tag/components/TagTraceDetailsPopover";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";

export function TracePage({
  traceId,
  timestamp,
}: {
  traceId: string;
  timestamp?: Date;
}) {
  const router = useRouter();

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    {
      traceId,
      timestamp,
      projectId: router.query.projectId as string,
    },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
    },
  );

  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    trace.data?.projectId ?? "",
  );

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId: trace.data?.projectId as string,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !!trace.data?.projectId && isAuthenticatedAndProjectMember,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const filterOptionTags = traceFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  if (trace.error?.data?.code === "UNAUTHORIZED")
    return <ErrorPage message="You do not have access to this trace." />;

  if (trace.error?.data?.code === "NOT_FOUND")
    return (
      <ErrorPage
        title="Trace not found"
        message="The trace is either still being processed or has been deleted."
        additionalButton={{
          label: "Retry",
          onClick: () => void window.location.reload(),
        }}
      />
    );

  if (!trace.data) return <div className="p-3">Loading...</div>;

  return (
    <Page
      headerProps={{
        title: trace.data.name
          ? `${trace.data.name}: ${trace.data.id}`
          : trace.data.id,
        itemType: "TRACE",
        breadcrumb: [
          {
            name: "Traces",
            href: `/project/${router.query.projectId as string}/traces`,
          },
        ],
        actionButtonsLeft: (
          <div className="ml-1 flex items-center gap-1">
            <div className="max-h-[10dvh] overflow-y-auto">
              <TagTraceDetailsPopover
                tags={trace.data.tags}
                availableTags={allTags}
                traceId={trace.data.id}
                projectId={trace.data.projectId}
                className="flex-wrap"
                key={trace.data.id}
              />
            </div>
            <div className="flex items-center gap-0">
              <StarTraceDetailsToggle
                traceId={trace.data.id}
                projectId={trace.data.projectId}
                value={trace.data.bookmarked}
                size="icon-xs"
              />
              <PublishTraceSwitch
                traceId={trace.data.id}
                projectId={trace.data.projectId}
                isPublic={trace.data.public}
                size="icon-xs"
              />
            </div>
          </div>
        ),
        actionButtonsRight: (
          <>
            <DetailPageNav
              currentId={traceId}
              path={(entry) => {
                const { view, display, projectId } = router.query;
                const queryParams = new URLSearchParams({
                  ...(typeof view === "string" ? { view } : {}),
                  ...(typeof display === "string" ? { display } : {}),
                });
                const queryParamString = Boolean(queryParams.size)
                  ? `?${queryParams.toString()}`
                  : "";

                const timestamp =
                  entry.params && entry.params.timestamp
                    ? encodeURIComponent(entry.params.timestamp)
                    : undefined;

                return `/project/${projectId as string}/traces/${entry.id}${queryParamString}${timestamp ? `?timestamp=${timestamp}` : ""}`;
              }}
              listKey="traces"
            />
            <DeleteTraceButton
              itemId={traceId}
              projectId={trace.data.projectId}
              redirectUrl={`/project/${router.query.projectId as string}/traces`}
              deleteConfirmation={trace.data.name ?? ""}
              icon
            />
          </>
        ),
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <Trace
          key={trace.data.id}
          trace={trace.data}
          scores={trace.data.scores}
          projectId={trace.data.projectId}
          observations={trace.data.observations}
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
        />
      </div>
    </Page>
  );
}
