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
import { HoverCard } from "@/src/components/design-system/HoverCard/HoverCard";

// Preview tab components
import { IOPreview } from "@/src/features/traces/components/IOPreview/IOPreview";
import { TagList } from "@/src/features/tag";
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
import { TraceDetailTabsBarList } from "../TraceDetailTabsBarList";

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
  const showMessagesTab = internalFeaturesEnabled && isV4;
  // Unsupported tabs fall back to Preview instead of rendering an empty panel.
  const selectedTab =
    globalSelectedTab === "attributes" ||
    (globalSelectedTab === "messages" && !showMessagesTab)
      ? "preview"
      : globalSelectedTab;
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

  // Tab visibility: hide Log View and Scores tabs in annotation mode
  const showLogViewTab = observations.length > 0 && !isAnnotationMode;

  // Check if log view will be virtualized (affects JSON tab availability)
  const isLogViewVirtualized =
    observations.length >= TRACE_VIEW_CONFIG.logView.virtualizationThreshold;

  // Scores tab visibility: hide for public trace viewers and in annotation mode
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const showScoresTab = isAuthenticatedAndProjectMember && !isAnnotationMode;

  // Hide entire tabs bar when only Preview tab remains (cleaner annotation mode UI)
  const showTabsBar = showLogViewTab || showScoresTab || showMessagesTab;

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
            {/* Hide the tabs bar when only Preview remains. */}
            {showTabsBar && (
              <TraceDetailTabsBarList
                tabs={[
                  "preview",
                  ...(showMessagesTab ? ["messages" as const] : []),
                  ...(showLogViewTab ? ["log" as const] : []),
                  ...(showScoresTab ? ["scores" as const] : []),
                ]}
                logViewDescription={
                  isLogViewVirtualized
                    ? `Shows all ${observations.length} observations with virtualization enabled.`
                    : "Shows all observations concatenated. Great for quickly scanning through them."
                }
                trailingControls={
                  /* View toggle for preview and log; invisible on other tabs so the row keeps its width. */
                  <div
                    className={cn(
                      "flex shrink-0 items-center",
                      !(
                        selectedTab === "log" ||
                        (selectedTab === "preview" && isPrettyViewAvailable)
                      ) && "invisible",
                    )}
                  >
                    <div className="h-fit shrink-0 py-0.5 pr-4 pl-2">
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
                  </div>
                }
              />
            )}

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
                {isAnnotationMode && trace.tags.length > 0 && (
                  <div className="space-y-1 pt-1 pb-2">
                    <div className="text-sm font-bold">Tags</div>
                    <TagList selectedTags={trace.tags} isLoading={false} />
                  </div>
                )}
                {/* I/O Preview (includes metadata in both views) */}
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
                  onAdvancedJsonExpansionChange={setAdvancedJsonExpansion}
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
                  showMetadata
                  onVirtualizationChange={setIsJSONBetaVirtualized}
                  projectId={projectId}
                  traceId={trace.id}
                  environment={trace.environment}
                />
              </div>
            </Tabs.Content>

            {/* Log View tab content */}
            <Tabs.Content value="log" layout="fill">
              <TraceLogView
                traceId={trace.id}
                projectId={projectId}
                currentView={isLogViewVirtualized ? "pretty" : currentView}
                target="trace"
              />
            </Tabs.Content>

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
