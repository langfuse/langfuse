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
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { BreakdownTooltip } from "@/src/components/trace/BreakdownToolTip";
import { InfoIcon } from "lucide-react";

export const TracePreview = ({
  trace,
  observations,
  scores,
  commentCounts,
  viewType = "detailed",
  className,
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
  className?: string;
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
    <Card
      className={cn(
        "col-span-2 flex max-h-full flex-col overflow-hidden",
        className,
      )}
    >
      {viewType === "detailed" && (
        <div className="flex flex-shrink-0 flex-row justify-end gap-2">
          <TabsBar value={selectedTab} onValueChange={setSelectedTab}>
            <TabsBarList>
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {isAuthenticatedAndProjectMember && (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              )}
            </TabsBarList>
          </TabsBar>
        </div>
      )}
      <div className="flex w-full flex-col overflow-y-auto">
        <CardHeader className="flex flex-row flex-wrap justify-between gap-2">
          <div className="flex flex-col gap-1">
            <CardTitle>
              <span className="mr-2 rounded-sm bg-input p-1 text-xs">
                TRACE
              </span>
              <span>{trace.name}</span>
            </CardTitle>
            <CardDescription>
              {trace.timestamp.toLocaleString()}
            </CardDescription>
            {viewType === "detailed" && (
              <div className="flex flex-wrap gap-2">
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
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {viewType === "detailed" && (
              <>
                <CommentDrawerButton
                  projectId={trace.projectId}
                  objectId={trace.id}
                  objectType="TRACE"
                  count={commentCounts?.get(trace.id)}
                />
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
              </>
            )}
            <NewDatasetItemFromTrace
              traceId={trace.id}
              projectId={trace.projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
            />
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectedTab === "preview" && (
            <>
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
              {viewType === "detailed" && (
                <ScoresPreview itemScoresBySource={traceScoresBySource} />
              )}
            </>
          )}
          {selectedTab === "scores" && (
            <ScoresTable
              projectId={trace.projectId}
              omittedFilter={["Trace ID"]}
              traceId={trace.id}
              hiddenColumns={["traceName", "jobConfigurationId", "userId"]}
              localStorageSuffix="TracePreview"
            />
          )}
        </CardContent>
        <CardFooter></CardFooter>
      </div>
    </Card>
  );
};
