/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 */

import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { Switch } from "@/src/components/design-system/Switch/Switch";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/src/utils/tailwind";
import {
  CommentDrawerController,
  getCommentDrawerInitialStateFromUrl,
  useCommentedPaths,
} from "@/src/features/comments";
import { api } from "@/src/utils/api";
import { useRouter } from "next/router";
import { TooltipProvider } from "@/src/components/ui/tooltip";
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";

// Preview tab components
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { IOPreviewJSON } from "@/src/features/traces/components/IOPreview/IOPreviewJSON";
import { useJsonExpansion } from "@/src/features/traces/contexts/JsonExpansionContext";
import { useMedia } from "@/src/features/traces/hooks/useMedia";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";

// Contexts and hooks
import { useTraceData } from "@/src/features/traces/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/features/traces/contexts/ViewPreferencesContext";
import {
  jsonViewToggleTab,
  normalizeJsonViewPreference,
} from "@/src/components/ui/jsonViewPreference";
import {
  type DetailTab,
  useSelection,
} from "@/src/features/traces/contexts/SelectionContext";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { useTraceAnalyticsDimensions } from "@/src/features/traces/hooks/useTraceAnalyticsDimensions";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth";
import { useHasProjectAccess } from "@/src/features/rbac";
import { useSession } from "next-auth/react";

// Extracted components
import { TraceDetailViewHeader } from "./components/TraceDetailViewHeader";
import { TraceLogView } from "../TraceLogView/TraceLogView";
import { TRACE_VIEW_CONFIG } from "@/src/features/traces/constants/traceViewConfig";
import { ScoresTable } from "@/src/features/scores";
import { getMostRecentCorrection } from "@/src/features/corrections";
import { useInternalFeaturesEnabled } from "@/src/features/feature-flags";
import { useReadPath } from "@/src/features/events";
import { TraceMessagesView } from "../TraceMessagesView/TraceMessagesView";
import { TraceDetailTabs } from "../TraceDetailTabs";
import { TraceDetailTabsBarList } from "../TraceDetailTabsBarList";
import { DetailAttributesTab } from "../DetailAttributesTab";
import { getDetailTabs } from "../../fns/getDetailTabs";
import { resolveDetailTab } from "../../fns/resolveDetailTab";

export interface TraceDetailViewProps {
  isLoading?: false;
  trace: Omit<WithStringifiedMetadata<TraceDomain>, "input" | "output"> & {
    latency?: number;
    input: string | null;
    output: string | null;
  };
  observations: ObservationReturnTypeWithMetadata[];
  corrections: ScoreDomain[];
  scores: WithStringifiedMetadata<ScoreDomain>[];
  projectId: string;
}

const rootClassName = "flex h-full flex-col overflow-hidden";

const LOADING_SECTIONS = ["input", "output", "metadata"];

export function TraceDetailView(
  props: TraceDetailViewProps | { isLoading: true },
) {
  if (props.isLoading === true) return <TraceDetailViewLoading />;
  return <LoadedTraceDetailView {...props} />;
}

/** Header, tab bar and preview sections as placeholders in their own slots. */
function TraceDetailViewLoading() {
  return (
    <div className={rootClassName}>
      <TraceDetailViewHeader isLoading />
      <Tabs value="none" layout="fill">
        <TraceDetailTabsBarList isLoading />
        <Tabs.Content value="none" layout="fill">
          <div className="flex min-h-0 w-full flex-1 flex-col gap-6 overflow-auto px-4 pt-4 pb-4">
            {LOADING_SECTIONS.map((section) => (
              <div key={section} className="space-y-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
                <Skeleton className="h-3 w-2/3" />
              </div>
            ))}
          </div>
        </Tabs.Content>
      </Tabs>
    </div>
  );
}

function LoadedTraceDetailView({
  trace,
  observations,
  scores,
  corrections,
  projectId,
}: TraceDetailViewProps) {
  const router = useRouter();
  // Tab and view state from URL (via SelectionContext)
  const { selectedTab: globalSelectedTab, setSelectedTab } = useSelection();
  const internalFeaturesEnabled = useInternalFeaturesEnabled();
  const { isV4 } = useReadPath();
  const utils = api.useUtils();
  const capture = usePostHogClientCapture();
  const analyticsDimensions = useTraceAnalyticsDimensions();
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);

  // Get jsonViewPreference directly from ViewPreferencesContext for "json-beta" support
  const {
    jsonViewPreference,
    setJsonViewPreference,
    jsonBetaEnabled,
    setJsonBetaEnabled,
    isPeekMode,
    isAnnotationMode,
  } = useViewPreferences();

  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const tabs = getDetailTabs({
    target: "trace",
    isV4,
    internalFeaturesEnabled,
    isAnnotationMode,
    hasObservations: observations.length > 0,
    canViewScores: isAuthenticatedAndProjectMember,
  });
  const selectedTab = resolveDetailTab(globalSelectedTab, tabs);
  const showScoresTab = tabs.includes("scores");
  const showLogViewTab = tabs.includes("log");

  // Map jsonViewPreference to currentView format expected by child components
  const currentView = jsonViewPreference;

  const selectedViewTab = jsonViewToggleTab(jsonViewPreference);

  const handleViewTabChange = useCallback(
    (tab: string) => {
      if (selectedTab === "log") {
        capture("trace_detail:log_view_interaction", {
          action: "view_mode_switch",
          target: "trace",
          mode: tab,
          ...analyticsDimensions,
        });
      }
      if (tab === "json") {
        setJsonViewPreference(jsonBetaEnabled ? "json-beta" : "json");
      } else {
        setJsonViewPreference(normalizeJsonViewPreference(tab));
      }
    },
    [
      jsonBetaEnabled,
      setJsonViewPreference,
      selectedTab,
      capture,
      analyticsDimensions,
    ],
  );

  const handleBetaToggle = useCallback(
    (enabled: boolean) => {
      capture("trace_detail:json_beta_toggle", {
        enabled,
        target: "trace",
        ...analyticsDimensions,
      });
      setJsonBetaEnabled(enabled);
      setJsonViewPreference(enabled ? "json-beta" : "json");
    },
    [setJsonBetaEnabled, setJsonViewPreference, capture, analyticsDimensions],
  );

  // Context hooks
  const { comments } = useTraceData();
  const {
    formattedExpansion,
    setFormattedFieldExpansion,
    jsonExpansion,
    setJsonFieldExpansion,
    advancedJsonExpansion,
    setAdvancedJsonExpansion,
  } = useJsonExpansion();

  // Data fetching
  const traceMedia = useMedia({ projectId, traceId: trace.id });

  // Parse trace I/O in background (Web Worker)
  const { parsedInput, parsedOutput, parsedMetadata, isParsing } =
    useParsedTrace({
      traceId: trace.id,
      input: trace.input,
      output: trace.output,
      metadata: trace.metadata,
    });

  // Fetch comments for this trace (for inline comment highlighting)
  const session = useSession();
  const hasCommentsReadAccess = useHasProjectAccess({
    projectId,
    scope: "comments:read",
  });
  const traceComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: trace.id,
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
      enabled: hasCommentsReadAccess && session.status === "authenticated",
    },
  );

  const commentedPathsByField = useCommentedPaths(traceComments.data);

  // Derived state
  const traceScores = useMemo(
    () => scores.filter((s) => !s.observationId),
    [scores],
  );

  const traceCorrections = useMemo(
    () => corrections.filter((c) => !c.observationId),
    [corrections],
  );

  const outputCorrection = getMostRecentCorrection(traceCorrections);

  // Check if log view will be virtualized (affects JSON tab availability)
  const isLogViewVirtualized =
    observations.length >= TRACE_VIEW_CONFIG.logView.virtualizationThreshold;

  const refreshTraceScores = useCallback(() => {
    utils.traces.byIdWithObservationsAndScores.invalidate({
      projectId,
      traceId: trace.id,
    });
    utils.events.scoresForTrace.invalidate({
      projectId,
      traceId: trace.id,
    });
  }, [projectId, trace.id, utils]);

  // Handle tab change
  const handleTabChange = (value: string) => {
    if (value === "scores") {
      refreshTraceScores();
    }
    if (value !== selectedTab) {
      capture("trace_detail:detail_tab_switch", {
        tab: value,
        target: "trace",
        ...analyticsDimensions,
      });
    }
    setSelectedTab(value as DetailTab);
  };

  return (
    <CommentDrawerController
      projectId={projectId}
      initialState={() => getCommentDrawerInitialStateFromUrl(router.query)}
      count={comments.get(trace.id)}
    >
      {({ disabled, openDrawer }) => (
        <div className={rootClassName}>
          {/* Header section (extracted component) */}
          <TraceDetailViewHeader
            trace={trace}
            parsedMetadata={parsedMetadata}
            projectId={projectId}
            traceScores={traceScores}
            commentCount={comments.get(trace.id)}
            commentDrawerControl={{
              disabled,
              openDrawer: () =>
                openDrawer({
                  type: "comments",
                  objectId: trace.id,
                  objectType: "TRACE",
                }),
            }}
          />

          {/* Tabs section */}
          <Tabs
            value={selectedTab}
            layout="fill"
            onValueChange={handleTabChange}
          >
            <TooltipProvider>
              <TraceDetailTabs
                selectedTab={selectedTab}
                onSelect={handleTabChange}
                tabs={tabs}
                observationCount={observations.length}
                isLogViewVirtualized={isLogViewVirtualized}
                trailingControls={
                  /* View toggle (Formatted/JSON) - show for preview and log tabs when pretty view available */
                  /* JSON views are disabled for virtualized log view (large traces) */
                  (selectedTab === "log" ||
                    selectedTab === "attributes" ||
                    (selectedTab === "preview" && isPrettyViewAvailable)) && (
                    <>
                      <div className="ml-auto h-fit shrink-0 py-0.5 pr-4 pl-2">
                        <Tabs
                          value={
                            selectedTab === "log" && isLogViewVirtualized
                              ? "pretty"
                              : selectedViewTab
                          }
                          onValueChange={(value) => {
                            // Don't allow JSON views for virtualized log view
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
                          <Tabs.List variant="inset" size="sm">
                            <Tabs.Trigger value="pretty" label="Formatted" />
                            {selectedTab === "log" && isLogViewVirtualized ? (
                              <HoverCard
                                openDelay={200}
                                sideOffset={8}
                                placement="bottom-end"
                                content={
                                  <div className="w-64 p-3 text-sm">
                                    <p className="font-bold">
                                      Raw view unavailable
                                    </p>
                                    <p className="text-muted-foreground mt-1">
                                      Disabled for traces with{" "}
                                      {
                                        TRACE_VIEW_CONFIG.logView
                                          .virtualizationThreshold
                                      }
                                      + observations to maintain performance.
                                    </p>
                                  </div>
                                }
                              >
                                {({ getTriggerProps }) => (
                                  <span tabIndex={0} {...getTriggerProps()}>
                                    <Tabs.Trigger
                                      value="json"
                                      disabled
                                      label="Raw"
                                    />
                                  </span>
                                )}
                              </HoverCard>
                            ) : (
                              <Tabs.Trigger value="json" label="Raw" />
                            )}
                          </Tabs.List>
                        </Tabs>
                      </div>
                      {/* Beta toggle - only show when JSON is selected and not in virtualized log view */}
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
                  )
                }
              />
            </TooltipProvider>

            {selectedTab === "messages" && (
              <Tabs.Content value="messages" layout="fill">
                <div className="min-h-0 flex-1 overflow-auto px-4">
                  <TraceMessagesView />
                </div>
              </Tabs.Content>
            )}

            {/* Preview tab content */}
            <Tabs.Content value="preview" layout="fill">
              <div
                className={cn(
                  "flex min-h-0 w-full flex-1 flex-col",
                  currentView === "json-beta" && isJSONBetaVirtualized
                    ? "overflow-hidden"
                    : "overflow-auto pb-4",
                  // The JSON beta viewer runs edge to edge with its own toolbar.
                  currentView !== "json-beta" && "px-4",
                )}
              >
                {/* I/O Preview */}
                <IOPreview
                  key={trace.id + "-io"}
                  input={trace.input ?? undefined}
                  output={trace.output ?? undefined}
                  metadata={trace.metadata ?? undefined}
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
                  metadataExpansionState={formattedExpansion.metadata}
                  onInputExpansionChange={(exp) =>
                    setFormattedFieldExpansion(
                      "input",
                      exp as Record<string, boolean>,
                    )
                  }
                  onOutputExpansionChange={(exp) =>
                    setFormattedFieldExpansion(
                      "output",
                      exp as Record<string, boolean>,
                    )
                  }
                  onMetadataExpansionChange={(exp) =>
                    setFormattedFieldExpansion(
                      "metadata",
                      exp as Record<string, boolean>,
                    )
                  }
                  advancedJsonExpansionState={advancedJsonExpansion}
                  onAdvancedJsonExpansionChange={(expansion) =>
                    setAdvancedJsonExpansion({
                      ...Object.fromEntries(
                        Object.entries(advancedJsonExpansion).filter(
                          ([path]) =>
                            path === "metadata" || path.startsWith("metadata."),
                        ),
                      ),
                      ...expansion,
                    })
                  }
                  jsonInputExpanded={jsonExpansion.input}
                  jsonOutputExpanded={jsonExpansion.output}
                  jsonMetadataExpanded={jsonExpansion.metadata}
                  onJsonInputExpandedChange={(expanded) =>
                    setJsonFieldExpansion("input", expanded)
                  }
                  onJsonOutputExpandedChange={(expanded) =>
                    setJsonFieldExpansion("output", expanded)
                  }
                  onJsonMetadataExpandedChange={(expanded) =>
                    setJsonFieldExpansion("metadata", expanded)
                  }
                  enableInlineComments={true}
                  onAddInlineComment={(selection) =>
                    openDrawer({
                      type: "inline-comment",
                      selection,
                      objectId: trace.id,
                      objectType: "TRACE",
                    })
                  }
                  commentedPathsByField={commentedPathsByField}
                  onVirtualizationChange={setIsJSONBetaVirtualized}
                  projectId={projectId}
                  traceId={trace.id}
                  environment={trace.environment}
                />
              </div>
            </Tabs.Content>

            <Tabs.Content value="attributes" layout="fill">
              {currentView === "json-beta" ? (
                <IOPreviewJSON
                  key={trace.id + "-metadata"}
                  metadata={trace.metadata ?? undefined}
                  parsedMetadata={parsedMetadata}
                  isParsing={isParsing}
                  media={traceMedia.data}
                  hideInput
                  hideOutput
                  showCorrections={false}
                  projectId={projectId}
                  traceId={trace.id}
                  expansionState={advancedJsonExpansion}
                  onExpansionChange={(expansion) =>
                    setAdvancedJsonExpansion({
                      ...Object.fromEntries(
                        Object.entries(advancedJsonExpansion).filter(
                          ([path]) =>
                            path !== "metadata" &&
                            !path.startsWith("metadata."),
                        ),
                      ),
                      ...expansion,
                    })
                  }
                  enableInlineComments
                  onAddInlineComment={(selection) =>
                    openDrawer({
                      type: "inline-comment",
                      selection,
                      objectId: trace.id,
                      objectType: "TRACE",
                    })
                  }
                  commentedPathsByField={commentedPathsByField}
                />
              ) : (
                <DetailAttributesTab
                  metadata={trace.metadata}
                  parsedMetadata={parsedMetadata}
                  objectId={trace.id}
                  projectId={projectId}
                  currentView={selectedViewTab}
                  media={traceMedia.data}
                  metadataExpansionState={formattedExpansion.metadata}
                  onMetadataExpansionChange={(expansion) =>
                    setFormattedFieldExpansion("metadata", expansion)
                  }
                  jsonMetadataExpanded={jsonExpansion.metadata}
                  onJsonMetadataExpandedChange={(expanded) =>
                    setJsonFieldExpansion("metadata", expanded)
                  }
                />
              )}
            </Tabs.Content>

            {/* Log View tab content */}
            {showLogViewTab && (
              <Tabs.Content value="log" layout="fill">
                <TraceLogView
                  traceId={trace.id}
                  projectId={projectId}
                  currentView={isLogViewVirtualized ? "pretty" : currentView}
                  target="trace"
                />
              </Tabs.Content>
            )}

            {/* Scores tab content */}
            {showScoresTab && (
              <Tabs.Content value="scores" layout="fill">
                <div className="flex h-full min-h-0 w-full flex-col overflow-hidden">
                  <ScoresTable
                    projectId={projectId}
                    traceId={trace.id}
                    hiddenColumns={[
                      "traceId",
                      "traceName",
                      "traceTags",
                      "jobConfigurationId",
                      "userId",
                    ]}
                    localStorageSuffix="TracePreview"
                    insetToolbar
                    disableUrlPersistence={isPeekMode || isAnnotationMode}
                  />
                </div>
              </Tabs.Content>
            )}
          </Tabs>
        </div>
      )}
    </CommentDrawerController>
  );
}
