/**
 * ConnectedObservationDetailView - Connects observation details to application data.
 *
 * Responsibility:
 * - Display observation metadata (type, timestamp, model, environment, etc.)
 * - Show cost and token usage with tooltips
 * - Provide tabbed interface (Preview, Log View [v4 only], Scores)
 * - Support Formatted/JSON toggle for preview and log view content
 *
 * Hooks:
 * - useViewPreferences() - for JSON view preference
 * - useState() - for tab selection
 * - useReadPath() - for v4 mode detection (enables log tab)
 *
 * Re-renders when:
 * - Observation prop changes (new observation selected)
 * - Tab selection changes
 * - View mode toggle changes
 */

import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { useCallback, useMemo, useState } from "react";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import { useJsonExpansion } from "@/src/features/traces/contexts/JsonExpansionContext";
import { useMedia } from "@/src/features/traces/hooks/useMedia";
import { useSelection } from "@/src/features/traces/contexts/SelectionContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";

// Contexts and hooks
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useParsedObservation } from "@/src/features/traces/hooks/useParsedObservation";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import { api } from "@/src/utils/api";

// Extracted components
import { ObservationDetailViewHeader } from "@/src/features/traces/components/ObservationDetailView/components/ObservationDetailViewHeader/ObservationDetailViewHeader";
import { TraceLogView } from "../TraceLogView/TraceLogView";
import { useReadPath } from "@/src/features/events/hooks/useReadPath";
import { TRACE_VIEW_CONFIG } from "@/src/features/traces/constants/traceViewConfig";
import {
  aggregateTraceMetrics,
  getDescendantIds,
} from "@/src/features/traces/fns/traceAggregation";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useSession } from "next-auth/react";
import useIsFeatureEnabled from "@/src/features/feature-flags/hooks/useIsFeatureEnabled";
import { ObservationPreview } from "./ObservationPreview";

export interface ConnectedObservationDetailViewProps {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
  traceId: string;
}

export function ConnectedObservationDetailView({
  observation,
  projectId,
  traceId,
}: ConnectedObservationDetailViewProps) {
  // Tab and view state from URL (via SelectionContext)
  const {
    selectedTab: globalSelectedTab,
    setSelectedTab: setGlobalSelectedTab,
  } = useSelection();
  const utils = api.useUtils();

  // V4 beta mode and observations for log tab
  const { isV4: isV4Enabled } = useReadPath();
  const {
    observations,
    roots,
    nodeMap,
    traceLevelScoreOwnerIds,
    detachedObservationId,
    detachedObservationIsMisplaced,
  } = useTraceData();
  const isLogViewVirtualized =
    observations.length >= TRACE_VIEW_CONFIG.logView.virtualizationThreshold;
  // Get jsonViewPreference directly from ViewPreferencesContext for "json-beta" support
  const {
    jsonViewPreference,
    setJsonViewPreference,
    jsonBetaEnabled,
    setJsonBetaEnabled,
    isPeekMode,
    isAnnotationMode,
  } = useViewPreferences();

  // Tab visibility: hide Log View and Scores tabs in annotation mode
  const showLogViewTab =
    isV4Enabled && observations.length > 0 && !isAnnotationMode;
  const showScoresTab = !isAnnotationMode;

  // Hide entire tabs bar when only Preview tab remains (cleaner annotation mode UI)
  const showTabsBar = showLogViewTab || showScoresTab;

  // for v4:
  // is this observation topmost in tree? we don't check for root observation here as this is not necessarily given.
  // Uses the tree's roots array which handles orphans correctly.
  // Both stay absent/false for an observation outside the loaded (capped) list:
  // subtree metrics and root-only chrome are tree facts we genuinely don't have,
  // so they are omitted rather than guessed. A merged-in row whose parent is also
  // past the cap sits AMONG the roots without being one — root chrome there would
  // assert a position we don't know.
  const treeNode = nodeMap.get(observation.id);
  const isRoot =
    roots.some((root) => root.id === observation.id) &&
    !(
      detachedObservationIsMisplaced && observation.id === detachedObservationId
    );

  // Without a TRACE row (v4) this span stands in for the trace, so its badge and
  // its Scores tab both cover the trace-level scores.
  const ownsTraceLevelScores = traceLevelScoreOwnerIds.has(observation.id);

  // For root observations, compute subtree metrics for badge tooltips.
  // We compute this lazily here rather than in tree-building.ts because:
  // - TreeNode.totalCost just has the aggregated cost, we use it
  // - costDetails/usageDetails (for tooltips) aren't in TreeNode, adding them causes high memory for all nodes, esp on big traces
  // - computation only runs when viewing a root observation and is memo'd
  const subtreeMetrics = useMemo(() => {
    if (!isRoot || !treeNode) return null;
    const descendantIds = getDescendantIds(treeNode);
    const descendantIdSet = new Set(descendantIds);

    const descendants = observations.filter((obs) =>
      descendantIdSet.has(obs.id),
    );
    const allObservations = [observation, ...descendants];
    return aggregateTraceMetrics(allObservations);
  }, [isRoot, treeNode, observations, observation]);

  // Map global tab to observation-specific tabs (preview, log, scores)
  // "log" tab only available in v4 mode when there are observations
  const selectedTab = useMemo(() => {
    if (globalSelectedTab === "scores") return "scores" as const;
    if (globalSelectedTab === "log" && showLogViewTab) return "log" as const;
    return "preview" as const;
  }, [globalSelectedTab, showLogViewTab]);

  const refreshTraceScores = useCallback(() => {
    utils.traces.byIdWithObservationsAndScores.invalidate({
      projectId,
      traceId,
    });
    utils.events.scoresForTrace.invalidate({
      projectId,
      traceId,
    });
  }, [projectId, traceId, utils]);

  const setSelectedTab = (tab: "preview" | "log" | "scores") => {
    if (tab === "scores") {
      refreshTraceScores();
    }
    setGlobalSelectedTab(tab);
  };

  // The normalized-parser formatted view is gated to admins and explicitly
  // flagged users; it must never surface for regular users.
  const showPrettyBeta = useIsFeatureEnabled("normalizedIoPreview", {
    projectId,
  });

  // Map jsonViewPreference to currentView format expected by child components
  const currentView = jsonViewPreference;
  // A persisted "pretty-beta" preference clamps to "pretty" when the beta
  // tab is unavailable, so the highlighted tab matches the rendered parser.
  const selectedViewTab =
    currentView === "pretty-beta"
      ? showPrettyBeta
        ? "pretty-beta"
        : "pretty"
      : currentView === "pretty"
        ? "pretty"
        : "json";
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);

  const handleViewTabChange = useCallback(
    (tab: string) => {
      if (tab === "pretty" || tab === "pretty-beta") {
        setJsonViewPreference(tab);
      } else {
        // When switching to JSON, use beta preference
        setJsonViewPreference(jsonBetaEnabled ? "json-beta" : "json");
      }
    },
    [jsonBetaEnabled, setJsonViewPreference],
  );

  const handleBetaToggle = useCallback(
    (enabled: boolean) => {
      setJsonBetaEnabled(enabled);
      setJsonViewPreference(enabled ? "json-beta" : "json");
    },
    [setJsonBetaEnabled, setJsonViewPreference],
  );

  // states for the inline comments
  const [pendingSelection, setPendingSelection] =
    useState<SelectionData | null>(null);
  const [isCommentDrawerOpen, setIsCommentDrawerOpen] = useState(false);

  const handleAddInlineComment = useCallback((selection: SelectionData) => {
    setPendingSelection(selection);
    setIsCommentDrawerOpen(true);
  }, []);

  const handleSelectionUsed = useCallback(() => {
    setPendingSelection(null);
  }, []);

  // Get comments, scores, corrections, and expansion state from contexts
  const { comments, serverScores: scores, corrections } = useTraceData();
  const {
    formattedExpansion,
    setFormattedFieldExpansion,
    jsonExpansion,
    setJsonFieldExpansion,
    advancedJsonExpansion,
    setAdvancedJsonExpansion,
  } = useJsonExpansion();
  const observationScores = useMemo(
    () => scores.filter((s) => s.observationId === observation.id),
    [scores, observation.id],
  );
  const observationCorrections = useMemo(
    () => corrections.filter((c) => c.observationId === observation.id),
    [corrections, observation.id],
  );

  const outputCorrection = getMostRecentCorrection(observationCorrections);

  // Fetch and parse observation input/output in background (Web Worker)
  // This combines tRPC fetch + non-blocking JSON parsing
  const {
    observation: observationWithIORaw,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    isLoadingObservation,
    isWaitingForParsing,
  } = useParsedObservation({
    observationId: observation.id,
    traceId: traceId,
    projectId: projectId,
    startTime: observation.startTime,
    baseObservation: observation,
  });

  // Type narrowing: when baseObservation is provided, result has full observation fields
  // (EventBatchIOOutput case only occurs when baseObservation is missing)
  const observationWithIO =
    observationWithIORaw && "type" in observationWithIORaw
      ? observationWithIORaw
      : undefined;

  // For backward compatibility, create observationWithIO query-like object
  const observationWithIOCompat = {
    data: observationWithIO,
    isLoading: isLoadingObservation,
  };

  // Fetch media for this observation
  const observationMedia = useMedia({
    projectId,
    traceId,
    observationId: observation.id,
  });

  const session = useSession();
  const hasCommentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const observationComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: observation.id,
      objectType: "OBSERVATION",
    },
    {
      refetchOnMount: false,
      enabled: hasCommentsReadAccess && session.status === "authenticated",
    },
  );

  const commentedPathsByField = useCommentedPaths(observationComments.data);

  // Calculate latency in seconds if not provided
  const latencySeconds = useMemo(() => {
    if (observation.latency) {
      return observation.latency;
    }
    if (observation.startTime && observation.endTime) {
      return (
        (observation.endTime.getTime() - observation.startTime.getTime()) / 1000
      );
    }
    return null;
  }, [observation.latency, observation.startTime, observation.endTime]);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <ObservationDetailViewHeader
        observation={observation}
        observationWithIO={observationWithIO}
        projectId={projectId}
        traceId={traceId}
        latencySeconds={latencySeconds}
        observationScores={observationScores}
        commentCount={comments.get(observation.id)}
        pendingSelection={pendingSelection}
        onSelectionUsed={handleSelectionUsed}
        isCommentDrawerOpen={isCommentDrawerOpen}
        onCommentDrawerOpenChange={setIsCommentDrawerOpen}
        subtreeMetrics={subtreeMetrics}
        treeNodeTotalCost={treeNode?.totalCost}
      />

      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={(value) =>
          setSelectedTab(value as "preview" | "log" | "scores")
        }
      >
        {showTabsBar && (
          <TooltipProvider>
            <TabsBarList>
              <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
              {showScoresTab ? (
                <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
              ) : null}
              {showLogViewTab ? (
                <TabsBarTrigger value="log">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span>Log View</span>
                    </TooltipTrigger>
                    <TooltipContent className="text-xs">
                      {isLogViewVirtualized
                        ? `Shows all ${observations.length} observations with virtualization enabled.`
                        : "Shows all observations concatenated. Great for quickly scanning through them."}
                    </TooltipContent>
                  </Tooltip>
                </TabsBarTrigger>
              ) : null}

              {(selectedTab === "log" ||
                (selectedTab === "preview" && isPrettyViewAvailable)) && (
                <>
                  <div className="ml-auto h-fit px-2 py-0.5">
                    <Tabs
                      value={
                        selectedTab === "log" &&
                        (isLogViewVirtualized ||
                          selectedViewTab === "pretty-beta")
                          ? "pretty"
                          : selectedViewTab
                      }
                      onValueChange={(value) => {
                        if (
                          selectedTab === "log" &&
                          isLogViewVirtualized &&
                          value === "json"
                        ) {
                          return;
                        }
                        handleViewTabChange(value);
                      }}
                    >
                      <Tabs.List size="sm">
                        {/* Log view never runs the normalized parser, so the
                          beta tab only renders on the preview tab. */}
                        {showPrettyBeta && selectedTab !== "log" && (
                          <Tabs.Trigger
                            value="pretty-beta"
                            size="sm"
                            label="Normalized (beta)"
                          />
                        )}
                        <Tabs.Trigger
                          value="pretty"
                          size="sm"
                          label="Formatted"
                        />
                        {selectedTab === "log" && isLogViewVirtualized ? (
                          <HoverCard openDelay={200}>
                            <HoverCardTrigger asChild>
                              <span>
                                <Tabs.Trigger
                                  value="json"
                                  size="sm"
                                  disabled
                                  label="JSON"
                                />
                              </span>
                            </HoverCardTrigger>
                            <HoverCardContent
                              align="end"
                              className="w-64 text-sm"
                              sideOffset={8}
                            >
                              <p className="font-bold">JSON view unavailable</p>
                              <p className="text-muted-foreground mt-1">
                                Disabled for traces with{" "}
                                {
                                  TRACE_VIEW_CONFIG.logView
                                    .virtualizationThreshold
                                }
                                + observations to maintain performance.
                              </p>
                            </HoverCardContent>
                          </HoverCard>
                        ) : (
                          <Tabs.Trigger value="json" size="sm" label="JSON" />
                        )}
                      </Tabs.List>
                    </Tabs>
                  </div>
                  {selectedViewTab === "json" &&
                    !(selectedTab === "log" && isLogViewVirtualized) && (
                      <div className="mr-1 flex items-center gap-1.5">
                        <Switch
                          size="sm"
                          checked={jsonBetaEnabled}
                          onCheckedChange={handleBetaToggle}
                        />
                        <span className="text-muted-foreground text-xs">
                          Beta
                        </span>
                      </div>
                    )}
                </>
              )}
            </TabsBarList>
          </TooltipProvider>
        )}

        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <ObservationPreview
            currentView={currentView}
            tags={isRoot ? observation.traceTags : undefined}
            previewKey={observation.id}
            onPrettyViewAvailabilityChange={setIsPrettyViewAvailable}
            previewProps={{
              observationName: observation.name ?? undefined,
              input: observationWithIOCompat.data?.input ?? undefined,
              output: observationWithIOCompat.data?.output ?? undefined,
              status: observation.statusMessage
                ? {
                    level: observation.level,
                    message: observation.statusMessage,
                  }
                : undefined,
              outputCorrection,
              metadata: observationWithIOCompat.data?.metadata ?? undefined,
              parsedInput,
              parsedOutput,
              parsedMetadata,
              isLoading: observationWithIOCompat.isLoading,
              isParsing: isWaitingForParsing,
              media: observationMedia.data,
              inputExpansionState: formattedExpansion.input,
              outputExpansionState: formattedExpansion.output,
              metadataExpansionState: formattedExpansion.metadata,
              onInputExpansionChange: (exp) =>
                setFormattedFieldExpansion(
                  "input",
                  exp as Record<string, boolean>,
                ),
              onOutputExpansionChange: (exp) =>
                setFormattedFieldExpansion(
                  "output",
                  exp as Record<string, boolean>,
                ),
              onMetadataExpansionChange: (exp) =>
                setFormattedFieldExpansion(
                  "metadata",
                  exp as Record<string, boolean>,
                ),
              advancedJsonExpansionState: advancedJsonExpansion,
              onAdvancedJsonExpansionChange: setAdvancedJsonExpansion,
              jsonInputExpanded: jsonExpansion.input,
              jsonOutputExpanded: jsonExpansion.output,
              jsonMetadataExpanded: jsonExpansion.metadata,
              onJsonInputExpandedChange: (expanded) =>
                setJsonFieldExpansion("input", expanded),
              onJsonOutputExpandedChange: (expanded) =>
                setJsonFieldExpansion("output", expanded),
              onJsonMetadataExpandedChange: (expanded) =>
                setJsonFieldExpansion("metadata", expanded),
              enableInlineComments: true,
              onAddInlineComment: handleAddInlineComment,
              commentedPathsByField,
              showMetadata: true,
              observationId: observation.id,
              projectId,
              traceId,
              environment: observation.environment,
            }}
          />
        </TabsBarContent>

        {showScoresTab ? (
          <TabsBarContent
            value="scores"
            className="mt-0 mr-4 mb-2 flex h-full min-h-0 flex-1 overflow-hidden"
          >
            <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
              <ScoresTable
                projectId={projectId}
                traceId={traceId}
                observationId={observation.id}
                includeTraceLevelScores={ownsTraceLevelScores}
                hiddenColumns={[
                  "traceId",
                  "observationId",
                  "traceName",
                  "traceTags",
                  "jobConfigurationId",
                  "userId",
                ]}
                localStorageSuffix="ObservationPreview"
                disableUrlPersistence={isPeekMode || isAnnotationMode}
              />
            </div>
          </TabsBarContent>
        ) : null}

        {showLogViewTab ? (
          <TabsBarContent
            value="log"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1"
          >
            <TraceLogView
              traceId={traceId}
              projectId={projectId}
              currentView={isLogViewVirtualized ? "pretty" : currentView}
            />
          </TabsBarContent>
        ) : null}
      </TabsBar>
    </div>
  );
}
