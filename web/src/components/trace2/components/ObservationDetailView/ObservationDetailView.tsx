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
import { useMemo, useState } from "react";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace2/api/useMedia";
import { useSelection } from "@/src/components/trace2/contexts/SelectionContext";
import { useViewPreferences } from "@/src/components/trace2/contexts/ViewPreferencesContext";

// Contexts and hooks
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useParsedObservation } from "@/src/hooks/useParsedObservation";

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
  const { jsonViewPreference, setJsonViewPreference } = useViewPreferences();

  // Map jsonViewPreference to currentView format expected by child components
  const currentView = jsonViewPreference;

  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);

  // Get comments, scores, and expansion state from contexts
  const { comments, scores } = useTraceData();
  const { expansionState, setFieldExpansion } = useJsonExpansion();
  const observationScores = useMemo(
    () => scores.filter((s) => s.observationId === observation.id),
    [scores, observation.id],
  );

  // Fetch and parse observation input/output in background (Web Worker)
  // This combines tRPC fetch + non-blocking JSON parsing
  const {
    observation: observationWithIO,
    parsedInput,
    parsedOutput,
    parsedMetadata,
    isLoadingObservation,
    isParsing,
  } = useParsedObservation({
    observationId: observation.id,
    traceId: traceId,
    projectId: projectId,
    startTime: observation.startTime,
  });

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

          {/* View toggle (Formatted/JSON/JSON Beta) - show for preview tab when pretty view is available */}
          {selectedTab === "preview" && isPrettyViewAvailable && (
            <Tabs
              className="ml-auto mr-1 h-fit px-2 py-0.5"
              value={currentView}
              onValueChange={(value) => {
                setJsonViewPreference(value as "pretty" | "json" | "json-beta");
              }}
            >
              <TabsList className="h-fit py-0.5">
                <TabsTrigger value="pretty" className="h-fit px-1 text-xs">
                  Formatted
                </TabsTrigger>
                <TabsTrigger value="json" className="h-fit px-1 text-xs">
                  JSON
                </TabsTrigger>
                <TabsTrigger value="json-beta" className="h-fit px-1 text-xs">
                  JSON Beta
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </TabsBarList>

        {/* Preview tab content */}
        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div
            className={`flex min-h-0 w-full flex-1 flex-col ${
              currentView === "json-beta" ? "overflow-hidden" : "overflow-auto"
            }`}
          >
            <IOPreview
              key={observation.id}
              observationName={observation.name ?? undefined}
              input={observationWithIOCompat.data?.input ?? undefined}
              output={observationWithIOCompat.data?.output ?? undefined}
              metadata={observationWithIOCompat.data?.metadata ?? undefined}
              parsedInput={parsedInput}
              parsedOutput={parsedOutput}
              parsedMetadata={parsedMetadata}
              isLoading={observationWithIOCompat.isLoading}
              isParsing={isParsing}
              media={observationMedia.data}
              currentView={currentView}
              setIsPrettyViewAvailable={setIsPrettyViewAvailable}
              inputExpansionState={expansionState.input}
              outputExpansionState={expansionState.output}
              onInputExpansionChange={(exp) => setFieldExpansion("input", exp)}
              onOutputExpansionChange={(exp) =>
                setFieldExpansion("output", exp)
              }
              showMetadata
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
            />
          </div>
        </TabsBarContent>
      </TabsBar>
    </div>
  );
}
