import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  type APIScore,
  type Trace,
  type ScoreSource,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { AggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { ScoresPreview } from "@/src/components/trace/ScoresPreview";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { api } from "@/src/utils/api";
import { cn } from "@/src/utils/tailwind";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { CreateNewAnnotationQueueItem } from "@/src/ee/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useMemo } from "react";
import { usdFormatter } from "@/src/utils/numbers";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon, Tag } from "lucide-react";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ItemBadge } from "@/src/components/ItemBadge";
import { TagTraceDetailsPopover } from "@/src/features/tag/components/TagTraceDetailsPopover";
import Link from "next/link";

export const TracePreview = ({
  trace,
  observations,
  scores,
  commentCounts,
  viewType = "detailed",
}: {
  trace: Omit<Trace, "input" | "output"> & {
    latency?: number;
    input: string | undefined;
    output: string | undefined;
  };
  observations: ObservationReturnType[];
  scores: APIScore[];
  commentCounts?: Map<string, number>;
  viewType?: "detailed" | "focused";
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);
  const hasEntitlement = useHasEntitlement("annotation-queues");
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    trace.projectId,
  );

  const traceFilterOptions = api.traces.filterOptions.useQuery(
    {
      projectId: trace.projectId,
    },
    {
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      enabled: !!trace.projectId && isAuthenticatedAndProjectMember,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      staleTime: Infinity,
    },
  );

  const filterOptionTags = traceFilterOptions.data?.tags ?? [];
  const allTags = filterOptionTags.map((t) => t.value);

  const traceScores = scores.filter((s) => s.observationId === null);
  const traceScoresBySource = traceScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, APIScore[]>());
  const traceMedia = api.media.getByTraceOrObservationId.useQuery(
    {
      traceId: trace.id,
      projectId: trace.projectId,
    },
    {
      enabled: isAuthenticatedAndProjectMember,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
    },
  );

  const totalCost = useMemo(
    () =>
      calculateDisplayTotalCost({
        allObservations: observations,
      }),
    [observations],
  );

  return (
    <div className="col-span-2 flex h-full flex-1 flex-col overflow-hidden md:col-span-3">
      <div className="flex h-full flex-1 flex-col items-start gap-2 overflow-hidden">
        <div className="mt-3 grid w-full min-w-0 grid-cols-[auto,auto] items-center justify-between">
          <div className="flex min-w-0 max-w-full flex-shrink flex-col">
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1 space-x-1">
              <ItemBadge type="TRACE" isSmall />
              <span className="mb-0 line-clamp-2 min-w-0 break-all text-lg font-medium md:break-normal md:break-words">
                {trace.name}
              </span>

              {trace.sessionId ? (
                <Link
                  href={`/project/${
                    trace.projectId
                  }/sessions/${encodeURIComponent(trace.sessionId)}`}
                >
                  <Badge>Session: {trace.sessionId}</Badge>
                </Link>
              ) : null}
              {trace.userId ? (
                <Link
                  href={`/project/${
                    trace.projectId as string
                  }/users/${encodeURIComponent(trace.userId)}`}
                >
                  <Badge>User ID: {trace.userId}</Badge>
                </Link>
              ) : null}
              {/* TODO: fix this */}
              {/* <AggUsageBadge observations={trace.observations} /> */}
              {totalCost ? (
                <Badge variant="outline">
                  {usdFormatter(totalCost.toNumber())}
                </Badge>
              ) : undefined}
              <LocalIsoDate
                date={trace.timestamp}
                accuracy="millisecond"
                type="badge"
              />
              {viewType === "detailed" && (
                <>
                  {!!trace.latency && (
                    <Badge variant="outline">
                      {formatIntervalSeconds(trace.latency)}
                    </Badge>
                  )}
                  <BreakdownTooltip
                    details={observations
                      .filter((o) => o.type === "GENERATION")
                      .map((o) => o.usageDetails)}
                  >
                    <AggUsageBadge
                      observations={observations}
                      rightIcon={<InfoIcon className="h-3 w-3" />}
                    />
                  </BreakdownTooltip>
                  {!!trace.release && (
                    <Badge variant="outline">Release: {trace.release}</Badge>
                  )}
                  {!!trace.version && (
                    <Badge variant="outline">Version: {trace.version}</Badge>
                  )}
                  {totalCost && (
                    <BreakdownTooltip
                      details={observations
                        .filter((o) => o.type === "GENERATION")
                        .map((o) => o.costDetails)}
                      isCost
                    >
                      <Badge variant="outline">
                        <span className="flex items-center gap-1">
                          Total Cost: {usdFormatter(totalCost.toNumber())}
                          <InfoIcon className="h-3 w-3" />
                        </span>
                      </Badge>
                    </BreakdownTooltip>
                  )}
                  <TagTraceDetailsPopover
                    tags={trace.tags}
                    availableTags={allTags}
                    traceId={trace.id}
                    projectId={trace.projectId}
                    className="flex-wrap"
                    key={trace.id}
                  />
                </>
              )}
            </div>

            <div className="min-h-1 flex-1" />
          </div>
          <div className="mr-3 flex h-full flex-wrap content-start items-start justify-end gap-1 lg:flex-nowrap">
            <NewDatasetItemFromTrace
              traceId={trace.id}
              projectId={trace.projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
            />
            {viewType === "detailed" && (
              <>
                <div className="flex items-start">
                  <AnnotateDrawer
                    key={"annotation-drawer" + trace.id}
                    projectId={trace.projectId}
                    traceId={trace.id}
                    scores={scores}
                    emptySelectedConfigIds={emptySelectedConfigIds}
                    setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                    hasGroupedButton={hasEntitlement}
                  />
                  {hasEntitlement && (
                    <CreateNewAnnotationQueueItem
                      projectId={trace.projectId}
                      objectId={trace.id}
                      objectType={AnnotationQueueObjectType.TRACE}
                    />
                  )}
                </div>
                <CommentDrawerButton
                  projectId={trace.projectId}
                  objectId={trace.id}
                  objectType="TRACE"
                  count={commentCounts?.get(trace.id)}
                />
              </>
            )}
          </div>
        </div>

        <TabsBar
          value={selectedTab}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onValueChange={(value) => setSelectedTab(value)}
        >
          {viewType === "detailed" && (
            <TabsBarList className="min-w-0 max-w-full justify-start overflow-x-auto">
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {isAuthenticatedAndProjectMember && (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              )}
            </TabsBarList>
          )}
          {/* show preview always if not detailed view */}
          <TabsBarContent
            value="preview"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 overflow-hidden pr-4"
          >
            <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
              <IOPreview
                key={trace.id + "-io"}
                input={trace.input ?? undefined}
                output={trace.output ?? undefined}
                media={traceMedia.data}
              />
              <JSONView
                key={trace.id + "-metadata"}
                title="Metadata"
                json={trace.metadata}
                media={
                  traceMedia.data?.filter((m) => m.field === "metadata") ?? []
                }
              />
            </div>
          </TabsBarContent>
          {isAuthenticatedAndProjectMember && (
            <TabsBarContent
              value="scores"
              className="mb-2 mr-4 mt-0 flex h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
                <ScoresTable
                  projectId={trace.projectId}
                  omittedFilter={["Trace ID"]}
                  traceId={trace.id}
                  hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
                  localStorageSuffix="TracePreview"
                />
              </div>
            </TabsBarContent>
          )}
        </TabsBar>
      </div>
    </div>
  );
};
