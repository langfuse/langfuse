import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  type APIScore,
  type Trace,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { AggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { api } from "@/src/utils/api";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { CreateNewAnnotationQueueItem } from "@/src/ee/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { useMemo, useState } from "react";
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
import { InfoIcon } from "lucide-react";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ItemBadge } from "@/src/components/ItemBadge";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";

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
  observations: ObservationReturnTypeWithMetadata[];
  scores: APIScore[];
  commentCounts?: Map<string, number>;
  viewType?: "detailed" | "focused";
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );
  const [currentView, setCurrentView] = useState<"pretty" | "json">("pretty");
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(false);
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);
  const hasEntitlement = useHasEntitlement("annotation-queues");
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    trace.projectId,
  );
  const capture = usePostHogClientCapture();

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
      <div className="flex h-full flex-1 flex-col items-start gap-1 overflow-hidden">
        <div className="mt-3 grid w-full grid-cols-[auto,auto] items-start justify-between gap-2">
          <div className="flex w-full flex-row items-start gap-2">
            <div className="mt-1.5">
              <ItemBadge type="TRACE" isSmall />
            </div>
            <span className="mb-0 line-clamp-2 min-w-0 break-all text-lg font-medium md:break-normal md:break-words">
              {trace.name}
            </span>
          </div>
          <div className="mr-3 flex h-full flex-wrap content-start items-start justify-end gap-1">
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
        <div className="grid w-full min-w-0 items-center justify-between">
          <div className="flex min-w-0 max-w-full flex-shrink flex-col">
            <div className="mb-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <LocalIsoDate
                date={trace.timestamp}
                accuracy="millisecond"
                className="text-sm"
              />
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              {trace.sessionId ? (
                <Link
                  href={`/project/${trace.projectId}/sessions/${encodeURIComponent(trace.sessionId)}`}
                >
                  <Badge>Session: {trace.sessionId}</Badge>
                </Link>
              ) : null}
              {trace.userId ? (
                <Link
                  href={`/project/${trace.projectId as string}/users/${encodeURIComponent(trace.userId)}`}
                >
                  <Badge>User ID: {trace.userId}</Badge>
                </Link>
              ) : null}

              {viewType === "detailed" && (
                <>
                  {!!trace.latency && (
                    <Badge variant="tertiary">
                      Latency: {formatIntervalSeconds(trace.latency)}
                    </Badge>
                  )}
                  {totalCost && (
                    <BreakdownTooltip
                      details={observations
                        .filter((o) => o.type === "GENERATION")
                        .map((o) => o.costDetails)}
                      isCost
                    >
                      <Badge variant="tertiary">
                        <span className="flex items-center gap-1">
                          Total Cost: {usdFormatter(totalCost.toNumber())}
                          <InfoIcon className="h-3 w-3" />
                        </span>
                      </Badge>
                    </BreakdownTooltip>
                  )}
                  <BreakdownTooltip
                    details={observations
                      .filter((o) => o.type === "GENERATION")
                      .map((o) => o.usageDetails)}
                  >
                    <AggUsageBadge
                      observations={observations}
                      rightIcon={<InfoIcon className="h-3 w-3" />}
                      variant="tertiary"
                    />
                  </BreakdownTooltip>

                  {!!trace.release && (
                    <Badge variant="tertiary">Release: {trace.release}</Badge>
                  )}
                  {!!trace.version && (
                    <Badge variant="tertiary">Version: {trace.version}</Badge>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <TabsBar
          value={selectedTab.includes("preview") ? "preview" : "scores"}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onValueChange={(value) => setSelectedTab(value)}
        >
          {viewType === "detailed" && (
            <TabsBarList className="min-w-0 max-w-full justify-start overflow-x-auto">
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {isAuthenticatedAndProjectMember && (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              )}
              {selectedTab.includes("preview") && isPrettyViewAvailable && (
                <Tabs
                  className="mb-1 ml-auto mr-1 h-fit px-2 py-0.5"
                  value={currentView}
                  onValueChange={(value) => {
                    capture("trace_detail:io_mode_switch", { view: value });
                    setCurrentView(value as "pretty" | "json");
                  }}
                >
                  <TabsList>
                    <TabsTrigger value="pretty" className="h-fit text-xs">
                      Formatted
                    </TabsTrigger>
                    <TabsTrigger value="json" className="h-fit text-xs">
                      JSON
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </TabsBarList>
          )}
          {/* show preview always if not detailed view */}
          <TabsBarContent
            value="preview"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 pr-3"
          >
            <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
              <div>
                <IOPreview
                  key={trace.id + "-io"}
                  input={trace.input ?? undefined}
                  output={trace.output ?? undefined}
                  media={traceMedia.data}
                  currentView={currentView}
                  setIsPrettyViewAvailable={setIsPrettyViewAvailable}
                />
              </div>
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
              className="mb-2 mr-4 mt-0 flex h-full min-h-0 w-full overflow-hidden md:flex-1"
            >
              <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pr-3 md:flex-1">
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
