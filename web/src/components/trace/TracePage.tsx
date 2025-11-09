import { StringParam, useQueryParam, withDefault } from "use-query-params";
import { PublishTraceSwitch } from "@/src/components/publish-object-switch";
import { DetailPageNav } from "@/src/features/navigate-detail-pages/DetailPageNav";
import { useRouter } from "next/router";
import { StarTraceDetailsToggle } from "@/src/components/star-toggle";
import { DeleteTraceButton } from "@/src/components/deleteButton";
import Page from "@/src/components/layouts/page";
import { Trace } from "@/src/components/trace";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type TraceDomain, type APIScoreV2 } from "@langfuse/shared";

export type TracePageProps = {
  projectId: string;
  traceId: string;
  publicTrace: boolean;
  traceScores: APIScoreV2[];
  observations: ObservationReturnTypeWithMetadata[];
  trace?: Omit<TraceDomain, "input" | "output" | "metadata"> & {
    input: string | null;
    output: string | null;
    metadata: string | null;
  };
};

export function TracePage(props: TracePageProps) {
  const { projectId, traceId, publicTrace, trace, traceScores, observations } =
    props;
  const router = useRouter();

  const [selectedTab, setSelectedTab] = useQueryParam(
    "display",
    withDefault(StringParam, "details"),
  );

  return (
    <Page
      headerProps={{
        title: trace?.name ? `${trace.name}: ${traceId}` : traceId,
        itemType: "TRACE",
        breadcrumb: [
          {
            name: "Traces",
            href: `/project/${router.query.projectId as string}/traces`,
          },
        ],
        actionButtonsLeft: (
          <div className="ml-1 flex items-center gap-1">
            <div className="flex items-center gap-0">
              {trace && (
                <StarTraceDetailsToggle
                  traceId={traceId}
                  projectId={projectId}
                  value={trace.bookmarked}
                  size="icon-xs"
                />
              )}
              <PublishTraceSwitch
                traceId={traceId}
                projectId={projectId}
                isPublic={publicTrace}
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
              projectId={projectId}
              redirectUrl={`/project/${router.query.projectId as string}/traces`}
              deleteConfirmation={traceId}
              icon
            />
          </>
        ),
      }}
    >
      <div className="flex max-h-full min-h-0 flex-1 overflow-hidden">
        <Trace
          trace={trace}
          traceId={traceId}
          scores={traceScores}
          projectId={projectId}
          observations={observations}
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
        />
      </div>
    </Page>
  );
}
