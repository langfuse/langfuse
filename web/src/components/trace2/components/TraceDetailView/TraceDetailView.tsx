/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 */

import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { Switch } from "@/src/components/ui/switch";
import { useCallback, useMemo, useState } from "react";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { api } from "@/src/utils/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/src/components/ui/hover-card";

// Preview tab components
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import TagList from "@/src/features/tag/components/TagList";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace2/api/useMedia";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";

// Contexts and hooks
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/components/trace2/contexts/ViewPreferencesContext";
import { useSelection } from "@/src/components/trace2/contexts/SelectionContext";
import { useIsAuthenticatedAndProjectMember } from "@/src/features/auth/hooks";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";

// Extracted components
import { TraceDetailViewHeader } from "./TraceDetailViewHeader";
import { TraceLogView } from "../TraceLogView/TraceLogView";
import { TRACE_VIEW_CONFIG } from "@/src/components/trace2/config/trace-view-config";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";

export interface TraceDetailViewProps {
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

export function TraceDetailView({
  trace,
  observations,
  scores,
  corrections,
  projectId,
}: TraceDetailViewProps) {
  // Tab and view state from URL (via SelectionContext)
  const { selectedTab, setSelectedTab } = useSelection();
  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);

  // Inline comment state
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

  // Get jsonViewPreference directly from ViewPreferencesContext for "json-beta" support
  const {
    jsonViewPreference,
    setJsonViewPreference,
    jsonBetaEnabled,
    setJsonBetaEnabled,
  } = useViewPreferences();

  // Map jsonViewPreference to currentView format expected by child components
  const currentView = jsonViewPreference;

  const selectedViewTab =
    jsonViewPreference === "pretty" ? "pretty" : ("json" as const);

  const handleViewTabChange = useCallback(
    (tab: string) => {
      if (tab === "pretty") {
        setJsonViewPreference("pretty");
      } else {
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
  const traceComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: trace.id,
      objectType: "TRACE",
    },
    {
      refetchOnMount: false,
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

  const showLogViewTab = observations.length > 0;

  // Check if log view will be virtualized (affects JSON tab availability)
  const isLogViewVirtualized =
    observations.length >= TRACE_VIEW_CONFIG.logView.virtualizationThreshold;

  // Scores tab visibility: hide for public trace viewers and in peek mode (annotation queues)
  const isAuthenticatedAndProjectMember =
    useIsAuthenticatedAndProjectMember(projectId);
  const showScoresTab = isAuthenticatedAndProjectMember;

  // Handle tab change
  const handleTabChange = (value: string) => {
    setSelectedTab(value as "preview" | "log" | "scores");
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header section (extracted component) */}
      <TraceDetailViewHeader
        trace={trace}
        observations={observations}
        parsedMetadata={parsedMetadata}
        projectId={projectId}
        traceScores={traceScores}
        commentCount={comments.get(trace.id)}
        pendingSelection={pendingSelection}
        onSelectionUsed={handleSelectionUsed}
        isCommentDrawerOpen={isCommentDrawerOpen}
        onCommentDrawerOpenChange={setIsCommentDrawerOpen}
      />

      {/* Tabs section */}
      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={handleTabChange}
      >
        <TooltipProvider>
          <TabsBarList>
            <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
            {showLogViewTab && (
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
            )}
            {showScoresTab && (
              <TabsBarTrigger value="scores">Scores</TabsBarTrigger>
            )}

            {/* View toggle (Formatted/JSON) - show for preview and log tabs when pretty view available */}
            {/* JSON views are disabled for virtualized log view (large traces) */}
            {(selectedTab === "log" ||
              (selectedTab === "preview" && isPrettyViewAvailable)) && (
              <>
                <Tabs
                  className="ml-auto h-fit px-2 py-0.5"
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
                  <TabsList className="h-fit py-0.5">
                    <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                      Formatted
                    </TabsTrigger>
                    {selectedTab === "log" && isLogViewVirtualized ? (
                      <HoverCard openDelay={200}>
                        <HoverCardTrigger asChild>
                          <TabsTrigger
                            value="json"
                            className="h-fit px-1 text-xs"
                            disabled
                          >
                            JSON
                          </TabsTrigger>
                        </HoverCardTrigger>
                        <HoverCardContent
                          align="end"
                          className="w-64 text-sm"
                          sideOffset={8}
                        >
                          <p className="font-medium">JSON view unavailable</p>
                          <p className="mt-1 text-muted-foreground">
                            Disabled for traces with{" "}
                            {TRACE_VIEW_CONFIG.logView.virtualizationThreshold}+
                            observations to maintain performance.
                          </p>
                        </HoverCardContent>
                      </HoverCard>
                    ) : (
                      <TabsTrigger value="json" className="h-fit px-1 text-xs">
                        JSON
                      </TabsTrigger>
                    )}
                  </TabsList>
                </Tabs>
                {/* Beta toggle - only show when JSON is selected and not in virtualized log view */}
                {selectedViewTab === "json" &&
                  !(selectedTab === "log" && isLogViewVirtualized) && (
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

        {/* Preview tab content */}
        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div
            className={`flex min-h-0 w-full flex-1 flex-col ${
              currentView === "json-beta" && isJSONBetaVirtualized
                ? "overflow-hidden"
                : "overflow-auto pb-4"
            }`}
          >
            {/* Tags Section - scrolls with content except in JSON Beta (virtualized) */}
            {trace.tags.length > 0 && (
              <>
                <div
                  className={`px-2 pt-2 text-sm font-medium ${currentView !== "pretty" ? "flex-shrink-0" : ""}`}
                >
                  Tags
                </div>
                <div
                  className={`flex flex-wrap gap-x-1 gap-y-1 px-2 pb-2 ${currentView !== "pretty" ? "flex-shrink-0" : ""}`}
                >
                  <TagList selectedTags={trace.tags} isLoading={false} />
                </div>
              </>
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
              onAddInlineComment={handleAddInlineComment}
              commentedPathsByField={commentedPathsByField}
              showMetadata
              onVirtualizationChange={setIsJSONBetaVirtualized}
              projectId={projectId}
              traceId={trace.id}
              environment={trace.environment}
            />
          </div>
        </TabsBarContent>

        {/* Log View tab content */}
        <TabsBarContent
          value="log"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <TraceLogView
            traceId={trace.id}
            projectId={projectId}
            currentView={isLogViewVirtualized ? "pretty" : currentView}
          />
        </TabsBarContent>

        {/* Scores tab content */}
        {showScoresTab && (
          <TabsBarContent
            value="scores"
            className="mt-0 flex max-h-full min-h-0 w-full flex-1 overflow-hidden"
          >
            <div className="flex h-full min-h-0 w-full flex-col overflow-hidden pr-3">
              <ScoresTable
                projectId={projectId}
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
  );
}
