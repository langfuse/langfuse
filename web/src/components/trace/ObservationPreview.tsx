import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import {
  AnnotationQueueObjectType,
  type APIScore,
  type ScoreSource,
} from "@langfuse/shared";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import Link from "next/link";
import { usdFormatter } from "@/src/utils/numbers";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { ScoresPreview } from "@/src/components/trace/ScoresPreview";
import { JumpToPlaygroundButton } from "@/src/ee/features/playground/page/components/JumpToPlaygroundButton";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { cn } from "@/src/utils/tailwind";
import { NewDatasetItemFromTrace } from "@/src/features/datasets/components/NewDatasetItemFromObservationButton";
import { CreateNewAnnotationQueueItem } from "@/src/ee/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { useHasEntitlement } from "@/src/features/entitlements/hooks";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import { useMemo } from "react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { BreakdownTooltip } from "./BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";

export const ObservationPreview = ({
  observations,
  projectId,
  scores,
  currentObservationId,
  traceId,
  commentCounts,
  viewType = "detailed",
  className,
}: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: APIScore[];
  currentObservationId: string;
  traceId: string;
  commentCounts?: Map<string, number>;
  viewType?: "focused" | "detailed";
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
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);

  const currentObservation = observations.find(
    (o) => o.id === currentObservationId,
  );

  const observationWithInputAndOutput = api.observations.byId.useQuery({
    observationId: currentObservationId,
    startTime: currentObservation?.startTime,
    traceId: traceId,
    projectId: projectId,
  });

  const observationMedia = api.media.getByTraceOrObservationId.useQuery(
    {
      traceId: traceId,
      observationId: currentObservationId,
      projectId: projectId,
    },
    {
      enabled: isAuthenticatedAndProjectMember,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      staleTime: 50 * 60 * 1000, // 50 minutes
    },
  );

  const preloadedObservation = observations.find(
    (o) => o.id === currentObservationId,
  );

  const thisCost = preloadedObservation
    ? calculateDisplayTotalCost({
        allObservations: [preloadedObservation],
      })
    : undefined;

  const totalCost = useMemo(
    () =>
      calculateDisplayTotalCost({
        allObservations: observations,
        rootObservationId: currentObservationId,
      }),
    [observations, currentObservationId],
  );

  if (!preloadedObservation) return <div className="flex-1">Not found</div>;

  const observationScores = scores.filter(
    (s) => s.observationId === preloadedObservation.id,
  );
  const observationScoresBySource = observationScores.reduce((acc, score) => {
    if (!acc.get(score.source)) {
      acc.set(score.source, []);
    }
    acc.get(score.source)?.push(score);
    return acc;
  }, new Map<ScoreSource, APIScore[]>());

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
            <CardTitle className="flex flex-row items-center gap-2">
              <span className="rounded-sm bg-input p-1 text-xs">
                {preloadedObservation.type}
              </span>
              <span>{preloadedObservation.name}</span>
            </CardTitle>
            <CardDescription className="flex gap-2">
              {preloadedObservation.startTime.toLocaleString()}
            </CardDescription>
            {viewType === "detailed" && (
              <div className="flex flex-wrap gap-2">
                {preloadedObservation.promptId ? (
                  <PromptBadge
                    promptId={preloadedObservation.promptId}
                    projectId={preloadedObservation.projectId}
                  />
                ) : undefined}
                {preloadedObservation.timeToFirstToken ? (
                  <Badge variant="outline">
                    Time to first token:{" "}
                    {formatIntervalSeconds(
                      preloadedObservation.timeToFirstToken,
                    )}
                  </Badge>
                ) : null}
                {preloadedObservation.endTime ? (
                  <Badge variant="outline">
                    Latency:{" "}
                    {formatIntervalSeconds(
                      (preloadedObservation.endTime.getTime() -
                        preloadedObservation.startTime.getTime()) /
                        1000,
                    )}
                  </Badge>
                ) : null}
                {preloadedObservation.type === "GENERATION" && (
                  <BreakdownTooltip
                    details={preloadedObservation.usageDetails}
                    isCost={false}
                  >
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <span>
                        {preloadedObservation.promptTokens} prompt →{" "}
                        {preloadedObservation.completionTokens} completion (∑{" "}
                        {preloadedObservation.totalTokens})
                      </span>
                      <InfoIcon className="h-3 w-3" />
                    </Badge>
                  </BreakdownTooltip>
                )}
                {preloadedObservation.version ? (
                  <Badge variant="outline">
                    Version: {preloadedObservation.version}
                  </Badge>
                ) : undefined}
                {preloadedObservation.model ? (
                  preloadedObservation.modelId ? (
                    <Badge>
                      <Link
                        href={`/project/${preloadedObservation.projectId}/settings/models/${preloadedObservation.modelId}`}
                        className="flex items-center"
                        title="View model details"
                      >
                        {preloadedObservation.model}
                      </Link>
                    </Badge>
                  ) : (
                    <UpsertModelFormDrawer
                      action="create"
                      projectId={preloadedObservation.projectId}
                      prefilledModelData={{
                        modelName: preloadedObservation.model,
                        prices:
                          Object.keys(preloadedObservation.usageDetails)
                            .length > 0
                            ? Object.keys(preloadedObservation.usageDetails)
                                .filter((key) => key != "total")
                                .reduce(
                                  (acc, key) => {
                                    acc[key] = 0.000001;
                                    return acc;
                                  },
                                  {} as Record<string, number>,
                                )
                            : undefined,
                      }}
                      className="cursor-pointer"
                    >
                      <Badge
                        variant="outline"
                        className="flex items-center gap-1"
                      >
                        <span>{preloadedObservation.model}</span>
                        <PlusCircle className="h-3 w-3" />
                      </Badge>
                    </UpsertModelFormDrawer>
                  )
                ) : null}
                {thisCost ? (
                  <BreakdownTooltip
                    details={preloadedObservation.costDetails}
                    isCost={true}
                  >
                    <Badge
                      variant="outline"
                      className="flex items-center gap-1"
                    >
                      <span>{usdFormatter(thisCost.toNumber())}</span>
                      <InfoIcon className="h-3 w-3" />
                    </Badge>
                  </BreakdownTooltip>
                ) : undefined}
                {totalCost && totalCost !== thisCost ? (
                  <Badge variant="outline">
                    ∑ {usdFormatter(totalCost.toNumber())}
                  </Badge>
                ) : undefined}

                {preloadedObservation.modelParameters &&
                typeof preloadedObservation.modelParameters === "object"
                  ? Object.entries(preloadedObservation.modelParameters)
                      .filter(Boolean)
                      .map(([key, value]) => (
                        <Badge variant="outline" key={key}>
                          {key}:{" "}
                          {Object.prototype.toString.call(value) ===
                          "[object Object]"
                            ? JSON.stringify(value)
                            : value?.toString()}
                        </Badge>
                      ))
                  : null}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {viewType === "detailed" && (
              <>
                <CommentDrawerButton
                  projectId={preloadedObservation.projectId}
                  objectId={preloadedObservation.id}
                  objectType="OBSERVATION"
                  count={commentCounts?.get(preloadedObservation.id)}
                />
                <div className="flex items-start">
                  <AnnotateDrawer
                    key={"annotation-drawer" + preloadedObservation.id}
                    projectId={projectId}
                    traceId={traceId}
                    observationId={preloadedObservation.id}
                    scores={scores}
                    emptySelectedConfigIds={emptySelectedConfigIds}
                    setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                    type="observation"
                    hasGroupedButton={hasEntitlement}
                  />
                  {hasEntitlement && (
                    <CreateNewAnnotationQueueItem
                      projectId={projectId}
                      objectId={preloadedObservation.id}
                      objectType={AnnotationQueueObjectType.OBSERVATION}
                    />
                  )}
                </div>

                {observationWithInputAndOutput.data?.type === "GENERATION" && (
                  <JumpToPlaygroundButton
                    source="generation"
                    generation={observationWithInputAndOutput.data}
                    analyticsEventName="trace_detail:test_in_playground_button_click"
                  />
                )}
              </>
            )}
            {observationWithInputAndOutput.data ? (
              <NewDatasetItemFromTrace
                traceId={preloadedObservation.traceId}
                observationId={preloadedObservation.id}
                projectId={projectId}
                input={observationWithInputAndOutput.data.input}
                output={observationWithInputAndOutput.data.output}
                metadata={observationWithInputAndOutput.data.metadata}
                key={preloadedObservation.id}
              />
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {selectedTab === "preview" && (
            <>
              <IOPreview
                key={preloadedObservation.id + "-input"}
                input={observationWithInputAndOutput.data?.input ?? undefined}
                output={observationWithInputAndOutput.data?.output ?? undefined}
                isLoading={observationWithInputAndOutput.isLoading}
                media={observationMedia.data}
              />
              {preloadedObservation.statusMessage ? (
                <JSONView
                  key={preloadedObservation.id + "-status"}
                  title="Status Message"
                  json={preloadedObservation.statusMessage}
                />
              ) : null}
              {observationWithInputAndOutput.data?.metadata ? (
                <JSONView
                  key={observationWithInputAndOutput.data.id + "-metadata"}
                  title="Metadata"
                  json={observationWithInputAndOutput.data.metadata}
                  media={observationMedia.data?.filter(
                    (m) => m.field === "metadata",
                  )}
                />
              ) : null}
              {viewType === "detailed" && (
                <ScoresPreview itemScoresBySource={observationScoresBySource} />
              )}
            </>
          )}
          {selectedTab === "scores" && (
            <ScoresTable
              projectId={projectId}
              traceId={traceId}
              omittedFilter={["Observation ID"]}
              observationId={preloadedObservation.id}
              hiddenColumns={[
                "traceId",
                "observationId",
                "traceName",
                "jobConfigurationId",
                "userId",
              ]}
              localStorageSuffix="ObservationPreview"
            />
          )}
        </CardContent>
      </div>
    </Card>
  );
};

const PromptBadge = (props: { promptId: string; projectId: string }) => {
  const prompt = api.prompts.byId.useQuery({
    id: props.promptId,
    projectId: props.projectId,
  });

  if (prompt.isLoading || !prompt.data) return null;
  return (
    <Link
      href={`/project/${props.projectId}/prompts/${encodeURIComponent(prompt.data.name)}?version=${prompt.data.version}`}
    >
      <Badge>
        Prompt: {prompt.data.name}
        {" - v"}
        {prompt.data.version}
      </Badge>
    </Link>
  );
};
