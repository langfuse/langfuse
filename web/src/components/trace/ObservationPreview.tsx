import { JSONView } from "@/src/components/ui/CodeJsonViewer";
import { AnnotationQueueObjectType, type APIScoreV2 } from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import Link from "next/link";
import { usdFormatter } from "@/src/utils/numbers";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { cn } from "@/src/utils/tailwind";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { calculateDisplayTotalCost } from "@/src/components/trace/lib/helpers";
import { Fragment, useMemo, useState } from "react";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
  TabsBarContent,
} from "@/src/components/ui/tabs-bar";
import { BreakdownTooltip } from "./BreakdownToolTip";
import { InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDrawer } from "@/src/features/models/components/UpsertModelFormDrawer";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ItemBadge } from "@/src/components/ItemBadge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useRouter } from "next/router";
import { CopyIdsPopover } from "@/src/components/trace/CopyIdsPopover";

export const ObservationPreview = ({
  observations,
  projectId,
  scores,
  currentObservationId,
  traceId,
  commentCounts,
  viewType = "detailed",
  isTimeline,
}: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  scores: APIScoreV2[];
  currentObservationId: string;
  traceId: string;
  commentCounts?: Map<string, number>;
  viewType?: "focused" | "detailed";
  isTimeline?: boolean;
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );
  const [currentView, setCurrentView] = useState<"pretty" | "json">("pretty");
  const capture = usePostHogClientCapture();
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(false);
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const router = useRouter();
  const { peek } = router.query;
  const showScoresTab = isAuthenticatedAndProjectMember && peek === undefined;

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

  return (
    <div className="ph-no-capture col-span-2 flex h-full flex-1 flex-col overflow-hidden md:col-span-3">
      <div className="flex h-full flex-1 flex-col items-start gap-1 overflow-hidden">
        <div className="mt-3 grid w-full grid-cols-[auto,auto] items-start justify-between gap-2">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type={preloadedObservation.type} isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
              {preloadedObservation.name}
            </span>
            <CopyIdsPopover
              idItems={[
                { id: preloadedObservation.traceId, name: "Trace ID" },
                { id: preloadedObservation.id, name: "Observation ID" },
              ]}
            />
          </div>
          <div className="mr-3 flex h-full flex-wrap content-start items-start justify-end gap-1">
            {observationWithInputAndOutput.data && (
              <NewDatasetItemFromExistingObject
                traceId={preloadedObservation.traceId}
                observationId={preloadedObservation.id}
                projectId={projectId}
                input={observationWithInputAndOutput.data.input}
                output={observationWithInputAndOutput.data.output}
                metadata={observationWithInputAndOutput.data.metadata}
                key={preloadedObservation.id}
              />
            )}
            {viewType === "detailed" && (
              <>
                <div className="flex items-start">
                  <AnnotateDrawer
                    key={"annotation-drawer" + preloadedObservation.id}
                    projectId={projectId}
                    scoreTarget={{
                      type: "trace",
                      traceId: traceId,
                      observationId: preloadedObservation.id,
                    }}
                    scores={scores}
                    emptySelectedConfigIds={emptySelectedConfigIds}
                    setEmptySelectedConfigIds={setEmptySelectedConfigIds}
                    hasGroupedButton={true}
                    environment={preloadedObservation.environment}
                  />

                  <CreateNewAnnotationQueueItem
                    projectId={projectId}
                    objectId={preloadedObservation.id}
                    objectType={AnnotationQueueObjectType.OBSERVATION}
                  />
                </div>
                {observationWithInputAndOutput.data?.type === "GENERATION" && (
                  <JumpToPlaygroundButton
                    source="generation"
                    generation={observationWithInputAndOutput.data}
                    analyticsEventName="trace_detail:test_in_playground_button_click"
                    className={cn(isTimeline ? "!hidden" : "")}
                  />
                )}
                <CommentDrawerButton
                  projectId={preloadedObservation.projectId}
                  objectId={preloadedObservation.id}
                  objectType="OBSERVATION"
                  count={commentCounts?.get(preloadedObservation.id)}
                />
              </>
            )}
          </div>
        </div>
        <div className="grid w-full min-w-0 items-center justify-between">
          <div className="flex min-w-0 max-w-full flex-shrink flex-col">
            <div className="mb-1 flex min-w-0 max-w-full flex-wrap items-center gap-1">
              <LocalIsoDate
                date={preloadedObservation.startTime}
                accuracy="millisecond"
                className="text-sm"
              />
            </div>
            <div className="flex min-w-0 max-w-full flex-wrap items-center gap-1">
              {viewType === "detailed" && (
                <Fragment>
                  {preloadedObservation.endTime ? (
                    <Badge variant="tertiary">
                      Latency:{" "}
                      {formatIntervalSeconds(
                        (preloadedObservation.endTime.getTime() -
                          preloadedObservation.startTime.getTime()) /
                          1000,
                      )}
                    </Badge>
                  ) : null}

                  {preloadedObservation.timeToFirstToken ? (
                    <Badge variant="tertiary">
                      Time to first token:{" "}
                      {formatIntervalSeconds(
                        preloadedObservation.timeToFirstToken,
                      )}
                    </Badge>
                  ) : null}

                  {preloadedObservation.environment ? (
                    <Badge variant="tertiary">
                      Env: {preloadedObservation.environment}
                    </Badge>
                  ) : null}

                  {thisCost ? (
                    <BreakdownTooltip
                      details={preloadedObservation.costDetails}
                      isCost={true}
                    >
                      <Badge
                        variant="tertiary"
                        className="flex items-center gap-1"
                      >
                        <span>{usdFormatter(thisCost.toNumber())}</span>
                        <InfoIcon className="h-3 w-3" />
                      </Badge>
                    </BreakdownTooltip>
                  ) : undefined}
                  {totalCost && (!thisCost || !totalCost.equals(thisCost)) ? (
                    <Badge variant="tertiary">
                      ∑ {usdFormatter(totalCost.toNumber())}
                    </Badge>
                  ) : undefined}

                  {preloadedObservation.promptId ? (
                    <PromptBadge
                      promptId={preloadedObservation.promptId}
                      projectId={preloadedObservation.projectId}
                    />
                  ) : undefined}
                  {preloadedObservation.type === "GENERATION" && (
                    <BreakdownTooltip
                      details={preloadedObservation.usageDetails}
                      isCost={false}
                    >
                      <Badge
                        variant="tertiary"
                        className="flex items-center gap-1"
                      >
                        <span>
                          {preloadedObservation.inputUsage} prompt →{" "}
                          {preloadedObservation.outputUsage} completion (∑{" "}
                          {preloadedObservation.totalUsage})
                        </span>
                        <InfoIcon className="h-3 w-3" />
                      </Badge>
                    </BreakdownTooltip>
                  )}
                  {preloadedObservation.version ? (
                    <Badge variant="tertiary">
                      Version: {preloadedObservation.version}
                    </Badge>
                  ) : undefined}
                  {preloadedObservation.model ? (
                    preloadedObservation.internalModelId ? (
                      <Badge>
                        <Link
                          href={`/project/${preloadedObservation.projectId}/settings/models/${preloadedObservation.internalModelId}`}
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
                          variant="tertiary"
                          className="flex items-center gap-1"
                        >
                          <span>{preloadedObservation.model}</span>
                          <PlusCircle className="h-3 w-3" />
                        </Badge>
                      </UpsertModelFormDrawer>
                    )
                  ) : null}

                  <Fragment>
                    {preloadedObservation.modelParameters &&
                    typeof preloadedObservation.modelParameters === "object"
                      ? Object.entries(preloadedObservation.modelParameters)
                          .filter(([_, value]) => value !== null)
                          .map(([key, value]) => {
                            const valueString =
                              Object.prototype.toString.call(value) ===
                              "[object Object]"
                                ? JSON.stringify(value)
                                : value?.toString();
                            return (
                              <Badge
                                variant="tertiary"
                                key={key}
                                className="h-6 max-w-md"
                              >
                                {/* CHILD: This span handles the text truncation */}
                                <span
                                  className="overflow-hidden text-ellipsis whitespace-nowrap"
                                  title={valueString}
                                >
                                  {key}: {valueString}
                                </span>
                              </Badge>
                            );
                          })
                      : null}
                  </Fragment>
                </Fragment>
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
            <TabsBarList>
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {showScoresTab && (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              )}
              {selectedTab.includes("preview") && isPrettyViewAvailable && (
                <Tabs
                  className="ml-auto mr-1 h-fit px-2 py-0.5"
                  value={currentView}
                  onValueChange={(value) => {
                    capture("trace_detail:io_mode_switch", { view: value });
                    setCurrentView(value as "pretty" | "json");
                  }}
                >
                  <TabsList className="h-fit py-0.5">
                    <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                      Formatted
                    </TabsTrigger>
                    <TabsTrigger value="json" className="h-fit px-1 text-xs">
                      JSON
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </TabsBarList>
          )}
          <TabsBarContent
            value="preview"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 pr-3"
          >
            <div className="mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto">
              <div>
                <IOPreview
                  key={preloadedObservation.id + "-input"}
                  input={observationWithInputAndOutput.data?.input ?? undefined}
                  output={
                    observationWithInputAndOutput.data?.output ?? undefined
                  }
                  isLoading={observationWithInputAndOutput.isLoading}
                  media={observationMedia.data}
                  currentView={currentView}
                  setIsPrettyViewAvailable={setIsPrettyViewAvailable}
                />
              </div>
              <div>
                {preloadedObservation.statusMessage && (
                  <JSONView
                    key={preloadedObservation.id + "-status"}
                    title="Status Message"
                    json={preloadedObservation.statusMessage}
                  />
                )}
              </div>
              <div>
                {observationWithInputAndOutput.data?.metadata && (
                  <JSONView
                    key={observationWithInputAndOutput.data.id + "-metadata"}
                    title="Metadata"
                    json={observationWithInputAndOutput.data.metadata}
                    media={observationMedia.data?.filter(
                      (m) => m.field === "metadata",
                    )}
                  />
                )}
              </div>
            </div>
          </TabsBarContent>
          {showScoresTab && (
            <TabsBarContent
              value="scores"
              className="mb-2 mr-4 mt-0 flex h-full min-h-0 flex-1 overflow-hidden"
            >
              <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
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
              </div>
            </TabsBarContent>
          )}
        </TabsBar>
      </div>
    </div>
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
      className="inline-flex"
    >
      <Badge variant="tertiary">
        Prompt: {prompt.data.name}
        {" - v"}
        {prompt.data.version}
      </Badge>
    </Link>
  );
};
