/**
 * ObservationDetailView - Shows observation-level details when an observation is selected
 *
 * Responsibility:
 * - Display observation metadata (type, timestamp, model, environment, etc.)
 * - Show cost and token usage with tooltips
 * - Provide tabbed interface (Preview, Scores)
 * - Support Formatted/JSON toggle for preview content
 *
 * Hooks:
 * - useLocalStorage() - for JSON view preference
 * - useState() - for tab selection
 *
 * Re-renders when:
 * - Observation prop changes (new observation selected)
 * - Tab selection changes
 * - View mode toggle changes
 */

import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
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
import ScoresTable from "@/src/components/table/use-cases/scores";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { getMostRecentCorrection } from "@/src/features/corrections/utils/getMostRecentCorrection";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace2/api/useMedia";
import { useSelection } from "@/src/components/trace2/contexts/SelectionContext";
import { useViewPreferences } from "@/src/components/trace2/contexts/ViewPreferencesContext";

// Contexts and hooks
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useParsedObservation } from "@/src/hooks/useParsedObservation";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import { api } from "@/src/utils/api";

// Extracted components
import { ObservationDetailViewHeader } from "./ObservationDetailViewHeader";

export interface ObservationDetailViewProps {
  observation: ObservationReturnTypeWithMetadata;
  projectId: string;
  traceId: string;
}

export function ObservationDetailView({
  observation,
  projectId,
  traceId,
}: ObservationDetailViewProps) {
  // Tab and view state from URL (via SelectionContext)
  // For observations, "log" tab doesn't apply - map to "preview"
  const {
    selectedTab: globalSelectedTab,
    setSelectedTab: setGlobalSelectedTab,
  } = useSelection();

  // Map global tab to observation-specific tabs (preview, scores)
  // "log" tab doesn't exist for observations, so fall back to "preview"
  const selectedTab =
    globalSelectedTab === "scores" ? "scores" : ("preview" as const);

  const setSelectedTab = (tab: "preview" | "scores") => {
    setGlobalSelectedTab(tab);
  };

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

  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);
  const [isJSONBetaVirtualized, setIsJSONBetaVirtualized] = useState(false);

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

  const observationComments = api.comments.getByObjectId.useQuery(
    {
      projectId,
      objectId: observation.id,
      objectType: "OBSERVATION",
    },
    {
      refetchOnMount: false,
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
      {/* Header section (extracted component) */}
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
      />

      {/* Tabs section */}
      <TabsBar
        value={selectedTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={(value) => setSelectedTab(value as "preview" | "scores")}
      >
        <TabsBarList>
          <TabsBarTrigger value="preview">Preview</TabsBarTrigger>
          <TabsBarTrigger value="scores">Scores</TabsBarTrigger>

          {/* View toggle (Formatted/JSON) - show for preview tab when pretty view is available */}
          {selectedTab === "preview" && isPrettyViewAvailable && (
            <>
              <Tabs
                className="ml-auto h-fit px-2 py-0.5"
                value={selectedViewTab}
                onValueChange={handleViewTabChange}
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
              {/* Beta toggle - only show when JSON is selected */}
              {selectedViewTab === "json" && (
                <div className="mr-1 flex items-center gap-1.5">
                  <Switch
                    size="sm"
                    checked={jsonBetaEnabled}
                    onCheckedChange={handleBetaToggle}
                  />
                  <span className="text-xs text-muted-foreground">Beta</span>
                </div>
              )}
            </>
          )}
        </TabsBarList>

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
            <IOPreview
              key={observation.id}
              observationName={observation.name ?? undefined}
              input={observationWithIOCompat.data?.input ?? undefined}
              output={observationWithIOCompat.data?.output ?? undefined}
              outputCorrection={outputCorrection}
              metadata={observationWithIOCompat.data?.metadata ?? undefined}
              parsedInput={parsedInput}
              parsedOutput={parsedOutput}
              parsedMetadata={parsedMetadata}
              isLoading={observationWithIOCompat.isLoading}
              isParsing={isWaitingForParsing}
              media={observationMedia.data}
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
              observationId={observation.id}
              onVirtualizationChange={setIsJSONBetaVirtualized}
              projectId={projectId}
              traceId={traceId}
              environment={observation.environment}
            />
            {currentView !== "json-beta" && (
              <div className="h-4 w-full flex-shrink-0" />
            )}
          </div>
        </TabsBarContent>

        {/* Scores tab content */}
        <TabsBarContent
          value="scores"
          className="mb-2 mr-4 mt-0 flex h-full min-h-0 flex-1 overflow-hidden"
        >
          <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden">
            <ScoresTable
              projectId={projectId}
              traceId={traceId}
              observationId={observation.id}
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
      </TabsBar>
    </div>
  );
}
