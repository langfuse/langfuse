import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import {
  type ScoreDomain,
  type TraceDomain,
  AnnotationQueueObjectType,
  isGenerationLike,
  LangfuseInternalTraceEnvironment,
} from "@langfuse/shared";
import { AggUsageBadge } from "@/src/components/token-usage-badge";
import { Badge } from "@/src/components/ui/badge";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { formatIntervalSeconds } from "@/src/utils/dates";
import { withDefault, StringParam, useQueryParam } from "use-query-params";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import useLocalStorage from "@/src/components/useLocalStorage";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { api } from "@/src/utils/api";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { useMemo, useState, useEffect } from "react";
import { usdFormatter } from "@/src/utils/numbers";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import type Decimal from "decimal.js";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { BreakdownTooltip } from "@/src/components/trace2/components/_shared/BreakdownToolTip";
import { ExternalLinkIcon, InfoIcon } from "lucide-react";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import { ItemBadge } from "@/src/components/ItemBadge";
import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Switch } from "@/src/components/ui/switch";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useRouter } from "next/router";
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { TraceLogView } from "@/src/components/trace2/components/TraceLogView/TraceLogView";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";
import { useJsonBetaToggle } from "@/src/components/trace2/hooks/useJsonBetaToggle";
import { TraceDataProvider } from "@/src/components/trace2/contexts/TraceDataContext";
import { ViewPreferencesProvider } from "@/src/components/trace2/contexts/ViewPreferencesContext";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import TagList from "@/src/features/tag/components/TagList";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/src/components/ui/alert-dialog";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { resolveEvalExecutionMetadata } from "@/src/components/trace2/lib/resolve-metadata";

const LOG_VIEW_CONFIRMATION_THRESHOLD = 150;
const LOG_VIEW_DISABLED_THRESHOLD = 350;

export const TracePreview = ({
  trace,
  observations,
  serverScores: scores,
  corrections,
  commentCounts,
  viewType = "detailed",
  showCommentButton = false,
  precomputedCost,
}: {
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  observations: ObservationReturnTypeWithMetadata[];
  serverScores: WithStringifiedMetadata<ScoreDomain>[];
  corrections: ScoreDomain[];
  commentCounts?: Map<string, number>;
  viewType?: "detailed" | "focused";
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

  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(false);
  const isAuthenticatedAndProjectMember = useIsAuthenticatedAndProjectMember(
    trace.projectId,
  );
  const capture = usePostHogClientCapture();
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

  const traceCorrections = corrections.filter(
    (c) => c.traceId === trace.id && c.observationId === null,
  );

  const outputCorrection = getMostRecentCorrection(traceCorrections);

  // Parse trace I/O in background (Web Worker)
  const { parsedInput, parsedOutput, parsedMetadata, isParsing } =
    useParsedTrace({
      traceId: trace.id,
      input: trace.input,
      output: trace.output,
      metadata: trace.metadata,
    });

  const totalCost = precomputedCost;

  const usageDetails = useMemo(
    () =>
      observations
        .filter((o) => isGenerationLike(o.type))
        .map((o) => o.usageDetails),
    [observations],
  );

  // For performance reasons, we preemptively disable the log view if there are too many observations.
  const isLogViewDisabled = observations.length > LOG_VIEW_DISABLED_THRESHOLD;
  const requiresConfirmation =
    observations.length > LOG_VIEW_CONFIRMATION_THRESHOLD && !isLogViewDisabled;
  const showLogViewTab = observations.length > 0;

  const [hasLogViewConfirmed, setHasLogViewConfirmed] = useState(false);
  const [showLogViewDialog, setShowLogViewDialog] = useState(false);

  useEffect(() => {
    setHasLogViewConfirmed(false);
  }, [trace.id]);

  useEffect(() => {
    if ((isLogViewDisabled || !showLogViewTab) && selectedTab === "log") {
      setSelectedTab("preview");
    }
  }, [isLogViewDisabled, showLogViewTab, selectedTab, setSelectedTab]);

  const handleConfirmLogView = () => {
    setHasLogViewConfirmed(true);
    setShowLogViewDialog(false);
    setSelectedTab("log");
  };

  const targetTraceId =
    trace.environment === LangfuseInternalTraceEnvironment.LLMJudge
      ? resolveEvalExecutionMetadata(parsedMetadata)
      : null;

  return (
    <div className="col-span-2 flex h-full flex-1 flex-col overflow-hidden md:col-span-3">
      <div className="flex h-full flex-1 flex-col items-start gap-1 overflow-hidden @container">
        <div className="mt-2 grid w-full grid-cols-1 items-start gap-2 px-2 @2xl:grid-cols-[auto,auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type="TRACE" isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
              {trace.name}
            </span>
            <CopyIdsPopover idItems={[{ id: trace.id, name: "Trace ID" }]} />
          </div>
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            <NewDatasetItemFromExistingObject
              traceId={trace.id}
              projectId={trace.projectId}
              input={trace.input}
              output={trace.output}
              metadata={trace.metadata}
              key={trace.id}
              size="sm"
            />
            {viewType === "detailed" && (
              <>
                <div className="flex items-start">
                  <AnnotateDrawer
                    key={"annotation-drawer" + trace.id}
                    projectId={trace.projectId}
                    scoreTarget={{
                      type: "trace",
                      traceId: trace.id,
                    }}
                    scores={scores}
                    scoreMetadata={{
                      projectId: trace.projectId,
                      environment: trace.environment,
                    }}
                    size="sm"
                  />
                  <CreateNewAnnotationQueueItem
                    projectId={trace.projectId}
                    objectId={trace.id}
                    objectType={AnnotationQueueObjectType.TRACE}
                    size="sm"
                  />
                </div>
                <CommentDrawerButton
                  projectId={trace.projectId}
                  objectId={trace.id}
                  objectType="TRACE"
                  count={commentCounts?.get(trace.id)}
                  size="sm"
                />
              </>
            )}
            {viewType === "focused" && showCommentButton && (
              <CommentDrawerButton
                projectId={trace.projectId}
                objectId={trace.id}
                objectType="TRACE"
                count={commentCounts?.get(trace.id)}
                size="sm"
              />
            )}
          </div>
        </div>
        <div className="grid w-full min-w-0 items-center justify-between px-2">
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
                  className="inline-flex"
                >
                  <Badge>
                    <span className="truncate">Session: {trace.sessionId}</span>
                    <ExternalLinkIcon className="ml-1 h-3 w-3" />
                  </Badge>
                </Link>
              ) : null}
              {trace.userId ? (
                <Link
                  href={`/project/${trace.projectId as string}/users/${encodeURIComponent(trace.userId)}`}
                  className="inline-flex"
                >
                  <Badge>
                    <span className="truncate">User ID: {trace.userId}</span>
                    <ExternalLinkIcon className="ml-1 h-3 w-3" />
                  </Badge>
                </Link>
              ) : null}
              {targetTraceId ? (
                <Link
                  href={`/project/${trace.projectId as string}/traces/${encodeURIComponent(targetTraceId)}`}
                  className="inline-flex"
                >
                  <Badge>
                    <span className="truncate">
                      Target Trace: {targetTraceId}
                    </span>
                    <ExternalLinkIcon className="ml-1 h-3 w-3" />
                  </Badge>
                </Link>
              ) : null}
              {trace.environment ? (
                <Badge variant="tertiary">Env: {trace.environment}</Badge>
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
                        .filter((o) => isGenerationLike(o.type))
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
                  {usageDetails.length > 0 && (
                    <BreakdownTooltip details={usageDetails}>
                      <AggUsageBadge
                        observations={observations}
                        rightIcon={<InfoIcon className="h-3 w-3" />}
                        variant="tertiary"
                      />
                    </BreakdownTooltip>
                  )}

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
          value={
            selectedTab === "log"
              ? "log"
              : selectedTab.includes("preview")
                ? "preview"
                : "scores"
          }
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
          onValueChange={(value) => {
            // on tab click, is confirmation is needed?
            if (
              value === "log" &&
              requiresConfirmation &&
              !hasLogViewConfirmed
            ) {
              setShowLogViewDialog(true);
              return;
            }
            capture("trace_detail:view_mode_switch", { mode: value });
            setSelectedTab(value);
          }}
        >
          {viewType === "detailed" && (
            <TooltipProvider>
              <TabsBarList>
                <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
                {showLogViewTab && (
                  <TabsBarTrigger value="log" disabled={isLogViewDisabled}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>Log View</span>
                      </TooltipTrigger>
                      <TooltipContent className="text-xs">
                        {isLogViewDisabled
                          ? `Log View is disabled for traces with more than ${LOG_VIEW_DISABLED_THRESHOLD} observations (this trace has ${observations.length})`
                          : requiresConfirmation
                            ? `Log View may be slow with ${observations.length} observations. Click to confirm.`
                            : "Shows all observations concatenated. Great for quickly scanning through them. Nullish values are omitted."}
                      </TooltipContent>
                    </Tooltip>
                  </TabsBarTrigger>
                )}
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
                        <TabsTrigger
                          value="json"
                          className="h-fit px-1 text-xs"
                        >
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
                {selectedTab === "log" && (
                  <>
                    <Tabs
                      className="ml-auto h-fit px-2 py-0.5"
                      value={selectedViewTab}
                      onValueChange={handleViewTabChange}
                    >
                      <TabsList className="h-fit py-0.5">
                        <TabsTrigger
                          value="pretty"
                          className="h-fit px-1 text-xs"
                        >
                          Formatted
                        </TabsTrigger>
                        <TabsTrigger
                          value="json"
                          className="h-fit px-1 text-xs"
                        >
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
            </TooltipProvider>
          )}
          {/* show preview always if not detailed view */}
          <TabsBarContent
            value="preview"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 pr-2"
          >
            <div
              className={`mb-2 flex max-h-full min-h-0 w-full flex-col gap-2 overflow-y-auto ${
                currentView === "json-beta" ? "" : "pb-4"
              }`}
            >
              <IOPreview
                key={trace.id + "-io"}
                input={trace.input ?? undefined}
                output={trace.output ?? undefined}
                outputCorrection={outputCorrection}
                parsedInput={parsedInput}
                parsedOutput={parsedOutput}
                parsedMetadata={parsedMetadata}
                isParsing={isParsing}
                media={traceMedia.data}
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
                projectId={trace.projectId}
                traceId={trace.id}
                environment={trace.environment}
              />

              {trace.tags.length > 0 && (
                <>
                  <div className="px-2 text-sm font-medium">{"Tags"}</div>
                  <div className="flex flex-wrap gap-x-1 gap-y-1 px-2">
                    <TagList selectedTags={trace.tags} isLoading={false} />
                  </div>
                </>
              )}

              <div className="px-2">
                <PrettyJsonView
                  key={trace.id + "-metadata"}
                  title="Metadata"
                  json={trace.metadata}
                  media={
                    traceMedia.data?.filter((m) => m.field === "metadata") ?? []
                  }
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
              </div>
            </div>
          </TabsBarContent>
          <TabsBarContent value="log">
            <TraceDataProvider
              trace={trace}
              observations={observations}
              serverScores={scores}
              corrections={corrections}
              comments={commentCounts ?? new Map()}
            >
              <ViewPreferencesProvider>
                <TraceLogView
                  traceId={trace.id}
                  projectId={trace.projectId}
                  currentView={currentView}
                />
              </ViewPreferencesProvider>
            </TraceDataProvider>
          </TabsBarContent>
          {showScoresTab && (
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
                  disableUrlPersistence
                />
              </div>
            </TabsBarContent>
          )}
        </TabsBar>
      </div>

      {/* Confirmation dialog for log view with many observations */}
      <AlertDialog open={showLogViewDialog} onOpenChange={setShowLogViewDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sluggish Performance Warning</AlertDialogTitle>
            <AlertDialogDescription>
              This trace has {observations.length} observations. The log view
              may be slow to load and interact with. Do you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowLogViewDialog(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLogView}>
              Show Log View
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
