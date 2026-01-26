import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  AnnotationQueueObjectType,
  type ScoreDomain,
  isGenerationLike,
} from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnType } from "@/src/server/api/routers/traces";
import { api } from "@/src/utils/api";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import Link from "next/link";
import { usdFormatter, formatTokenCounts } from "@/src/utils/numbers";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { cn } from "@/src/utils/tailwind";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { calculateDisplayTotalCost } from "@/src/components/trace2/lib/helpers";
import { Fragment, useState } from "react";
import type Decimal from "decimal.js";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import {
  TabsBar,
  TabsBarList,
  TabsBarTrigger,
  TabsBarContent,
} from "@/src/components/ui/tabs-bar";
import {
  BreakdownTooltip,
  calculateAggregatedUsage,
} from "@/src/components/trace2/components/_shared/BreakdownToolTip";
import { ExternalLinkIcon, InfoIcon, PlusCircle } from "lucide-react";
import { UpsertModelFormDialog } from "@/src/features/models/components/UpsertModelFormDialog";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ItemBadge } from "@/src/components/ItemBadge";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Switch } from "@/src/components/ui/switch";
import { useRouter } from "next/router";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { useParsedObservation } from "@/src/hooks/useParsedObservation";
import { PromptBadge } from "@/src/components/trace2/components/_shared/PromptBadge";
import { useJsonBetaToggle } from "@/src/components/trace2/hooks/useJsonBetaToggle";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";

export const ObservationPreview = ({
  observations,
  projectId,
  serverScores: scores,
  corrections,
  currentObservationId,
  traceId,
  commentCounts,
  viewType = "detailed",
  isTimeline,
  showCommentButton = false,
  precomputedCost,
}: {
  observations: Array<ObservationReturnType>;
  projectId: string;
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  currentObservationId: string;
  traceId: string;
  commentCounts?: Map<string, number>;
  viewType?: "focused" | "detailed";
  isTimeline?: boolean;
  showCommentButton?: boolean;
  precomputedCost: Decimal | undefined;
}) => {
  const [selectedTab, setSelectedTab] = useQueryParam(
    "view",
    withDefault(StringParam, "preview"),
  );
  const [currentView, setCurrentView] = useLocalStorage<
    "pretty" | "json" | "json-beta"
  >("jsonViewPreference", "pretty");
  const {
    jsonBetaEnabled,
    selectedViewTab,
    handleViewTabChange,
    handleBetaToggle,
  } = useJsonBetaToggle(currentView, setCurrentView);

  const capture = usePostHogClientCapture();
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(false);

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const router = useRouter();
  const { peek } = router.query;
  const showScoresTab = isAuthenticatedAndProjectMember && peek === undefined;
  const {
    formattedExpansion,
    setFormattedFieldExpansion,
    jsonExpansion,
    setJsonFieldExpansion,
    advancedJsonExpansion,
    setAdvancedJsonExpansion,
  } = useJsonExpansion();

  const currentObservation = observations.find(
    (o) => o.id === currentObservationId,
  );

  const currentObservationScores = scores.filter(
    (s) => s.observationId === currentObservationId,
  );

  const currentObservationCorrections = corrections.filter(
    (c) => c.observationId === currentObservationId,
  );

  // Fetch and parse observation input/output in background (Web Worker)
  const {
    observation: observationWithIORaw,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    isLoadingObservation,
    isWaitingForParsing,
  } = useParsedObservation({
    observationId: currentObservationId,
    traceId: traceId,
    projectId: projectId,
    startTime: currentObservation?.startTime,
    baseObservation: currentObservation,
  });

  // Type narrowing: when baseObservation is provided, result has full observation fields
  // (EventBatchIOOutput case only occurs when baseObservation is missing)
  const observationWithIO =
    observationWithIORaw && "type" in observationWithIORaw
      ? observationWithIORaw
      : undefined;

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

  const totalCost = precomputedCost;

  if (!preloadedObservation) return <div className="flex-1">Not found</div>;

  return (
    <div className="col-span-2 flex h-full flex-1 flex-col overflow-hidden md:col-span-3">
      <div className="flex h-full flex-1 flex-col items-start gap-1 overflow-hidden @container">
        <div className="mt-2 grid w-full grid-cols-1 items-start gap-2 px-2 @2xl:grid-cols-[auto,auto] @2xl:justify-between">
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
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            {observationWithIO && (
              <NewDatasetItemFromExistingObject
                traceId={preloadedObservation.traceId}
                observationId={preloadedObservation.id}
                projectId={projectId}
                input={observationWithIO.input}
                output={observationWithIO.output}
                metadata={observationWithIO.metadata}
                key={preloadedObservation.id}
                size="sm"
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
                    scores={currentObservationScores}
                    scoreMetadata={{
                      projectId: projectId,
                      environment: preloadedObservation.environment,
                    }}
                    size="sm"
                  />

                  <CreateNewAnnotationQueueItem
                    projectId={projectId}
                    objectId={preloadedObservation.id}
                    objectType={AnnotationQueueObjectType.OBSERVATION}
                    size="sm"
                  />
                </div>
                {observationWithIO &&
                  isGenerationLike(observationWithIO.type) && (
                    <JumpToPlaygroundButton
                      source="generation"
                      generation={observationWithIO}
                      analyticsEventName="trace_detail:test_in_playground_button_click"
                      className={cn(isTimeline ? "!hidden" : "")}
                      size="sm"
                    />
                  )}
                <CommentDrawerButton
                  projectId={preloadedObservation.projectId}
                  objectId={preloadedObservation.id}
                  objectType="OBSERVATION"
                  count={commentCounts?.get(preloadedObservation.id)}
                  size="sm"
                />
              </>
            )}
            {viewType === "focused" && showCommentButton && (
              <CommentDrawerButton
                projectId={preloadedObservation.projectId}
                objectId={preloadedObservation.id}
                objectType="OBSERVATION"
                count={commentCounts?.get(preloadedObservation.id)}
                size="sm"
              />
            )}
          </div>
        </div>
        <div className="grid w-full min-w-0 items-center justify-between px-2">
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
                      pricingTierName={
                        preloadedObservation.usagePricingTierName ?? undefined
                      }
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
                  {isGenerationLike(preloadedObservation.type) &&
                    (() => {
                      const aggregatedUsage = calculateAggregatedUsage(
                        preloadedObservation.usageDetails,
                      );

                      return (
                        <BreakdownTooltip
                          details={preloadedObservation.usageDetails}
                          isCost={false}
                          pricingTierName={
                            preloadedObservation.usagePricingTierName ??
                            undefined
                          }
                        >
                          <Badge
                            variant="tertiary"
                            className="flex items-center gap-1"
                          >
                            <span>
                              {formatTokenCounts(
                                aggregatedUsage.input,
                                aggregatedUsage.output,
                                aggregatedUsage.total,
                                true,
                              )}
                            </span>
                            <InfoIcon className="h-3 w-3" />
                          </Badge>
                        </BreakdownTooltip>
                      );
                    })()}
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
                          <span className="truncate">
                            {preloadedObservation.model}
                          </span>
                          <ExternalLinkIcon className="ml-1 h-3 w-3" />
                        </Link>
                      </Badge>
                    ) : (
                      <UpsertModelFormDialog
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
                      </UpsertModelFormDialog>
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
                <>
                  <Tabs
                    className="ml-auto h-fit px-2 py-0.5"
                    value={selectedViewTab}
                    onValueChange={(value) => {
                      capture("trace_detail:io_mode_switch", { view: value });
                      handleViewTabChange(value);
                    }}
                  >
                    <TabsList className="h-fit py-0.5">
                      <TabsTrigger
                        value="pretty"
                        className="h-fit px-1 text-xs"
                      >
                        Formatted
                      </TabsTrigger>
                      <TabsTrigger value="json" className="h-fit px-1 text-xs">
                        JSON
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                  {selectedViewTab === "json" && (
                    <div className="mr-1 flex items-center gap-1.5">
                      <Switch
                        size="sm"
                        checked={jsonBetaEnabled}
                        onCheckedChange={handleBetaToggle}
                      />
                      <span className="text-xs text-muted-foreground">
                        Beta
                      </span>
                    </div>
                  )}
                </>
              )}
            </TabsBarList>
          )}
          <TabsBarContent
            value="preview"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 pr-2"
          >
            <div
              className={`mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto ${
                currentView === "json-beta" ? "" : "pb-4"
              }`}
            >
              <div>
                <IOPreview
                  key={preloadedObservation.id + "-input"}
                  observationName={preloadedObservation.name ?? undefined}
                  input={observationWithIO?.input ?? undefined}
                  output={observationWithIO?.output ?? undefined}
                  metadata={observationWithIO?.metadata ?? undefined}
                  parsedInput={parsedInput}
                  parsedOutput={parsedOutput}
                  parsedMetadata={parsedMetadata}
                  outputCorrection={getMostRecentCorrection(
                    currentObservationCorrections,
                  )}
                  observationId={currentObservationId}
                  isLoading={isLoadingObservation}
                  isParsing={isWaitingForParsing}
                  media={observationMedia.data}
                  currentView={currentView}
                  setIsPrettyViewAvailable={setIsPrettyViewAvailable}
                  inputExpansionState={formattedExpansion.input}
                  outputExpansionState={formattedExpansion.output}
                  onInputExpansionChange={(expansion) =>
                    setFormattedFieldExpansion(
                      "input",
                      expansion as Record<string, boolean>,
                    )
                  }
                  onOutputExpansionChange={(expansion) =>
                    setFormattedFieldExpansion(
                      "output",
                      expansion as Record<string, boolean>,
                    )
                  }
                  jsonInputExpanded={jsonExpansion.input}
                  jsonOutputExpanded={jsonExpansion.output}
                  onJsonInputExpandedChange={(expanded) =>
                    setJsonFieldExpansion("input", expanded)
                  }
                  onJsonOutputExpandedChange={(expanded) =>
                    setJsonFieldExpansion("output", expanded)
                  }
                  advancedJsonExpansionState={advancedJsonExpansion}
                  onAdvancedJsonExpansionChange={setAdvancedJsonExpansion}
                  projectId={projectId}
                  traceId={traceId}
                  environment={preloadedObservation.environment}
                />
              </div>
              <div>
                {preloadedObservation.statusMessage && (
                  <PrettyJsonView
                    key={preloadedObservation.id + "-status"}
                    title="Status Message"
                    json={preloadedObservation.statusMessage}
                    currentView={
                      currentView === "json-beta" ? "pretty" : currentView
                    }
                  />
                )}
              </div>
              <div className="px-2">
                {observationWithIO?.metadata && (
                  <PrettyJsonView
                    key={observationWithIO.id + "-metadata"}
                    title="Metadata"
                    json={observationWithIO.metadata}
                    media={observationMedia.data?.filter(
                      (m) => m.field === "metadata",
                    )}
                    currentView={
                      currentView === "json-beta" ? "pretty" : currentView
                    }
                    externalExpansionState={formattedExpansion.metadata}
                    onExternalExpansionChange={(expansion) =>
                      setFormattedFieldExpansion(
                        "metadata",
                        expansion as Record<string, boolean>,
                      )
                    }
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
                  disableUrlPersistence
                />
              </div>
            </TabsBarContent>
          )}
        </TabsBar>
      </div>
    </div>
  );
};
