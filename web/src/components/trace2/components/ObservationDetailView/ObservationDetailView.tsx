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

import {
  type ObservationType,
  AnnotationQueueObjectType,
  isGenerationLike,
} from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { ItemBadge } from "@/src/components/ItemBadge";
import { LocalIsoDate } from "@/src/components/LocalIsoDate";
import {
  TabsBar,
  TabsBarContent,
  TabsBarList,
  TabsBarTrigger,
} from "@/src/components/ui/tabs-bar";
import { Tabs, TabsList, TabsTrigger } from "@/src/components/ui/tabs";
import { useCallback, useMemo, useState } from "react";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import {
  LatencyBadge,
  TimeToFirstTokenBadge,
  EnvironmentBadge,
  VersionBadge,
  LevelBadge,
  StatusMessageBadge,
} from "./ObservationMetadataBadgesSimple";
import { CostBadge, UsageBadge } from "./ObservationMetadataBadgesTooltip";
import { ModelBadge } from "./ObservationMetadataBadgeModel";
import { ModelParametersBadges } from "./ObservationMetadataBadgeModelParameters";
import ScoresTable from "@/src/components/table/use-cases/scores";
import { IOPreview } from "@/src/components/trace2/components/IOPreview/IOPreview";
import { useJsonExpansion } from "@/src/components/trace2/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace2/api/useMedia";
import { useSelection } from "@/src/components/trace2/contexts/SelectionContext";

// Header action components
import { CopyIdsPopover } from "@/src/components/trace2/components/_shared/CopyIdsPopover";
import { NewDatasetItemFromExistingObject } from "@/src/features/datasets/components/NewDatasetItemFromExistingObject";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { JumpToPlaygroundButton } from "@/src/features/playground/page/components/JumpToPlaygroundButton";
import { PromptBadge } from "@/src/components/trace2/components/_shared/PromptBadge";
import { useTraceData } from "@/src/components/trace2/contexts/TraceDataContext";
import { useParsedObservation } from "@/src/hooks/useParsedObservation";
import { api } from "@/src/utils/api";

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
    viewPref,
    setViewPref,
  } = useSelection();

  // Map global tab to observation-specific tabs (preview, scores)
  // "log" tab doesn't exist for observations, so fall back to "preview"
  const selectedTab =
    globalSelectedTab === "scores" ? "scores" : ("preview" as const);

  const setSelectedTab = (tab: "preview" | "scores") => {
    setGlobalSelectedTab(tab);
  };

  // Map viewPref to currentView format expected by child components
  const currentView = viewPref === "json" ? "json" : "pretty";

  const [isPrettyViewAvailable, setIsPrettyViewAvailable] = useState(true);

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

  // Build Maps of JSON paths with comment ranges, keyed by field
  const commentedPathsByField = useMemo(() => {
    if (!observationComments.data) return undefined;

    const inputMap = new Map<string, Array<{ start: number; end: number }>>();
    const outputMap = new Map<string, Array<{ start: number; end: number }>>();
    const metadataMap = new Map<
      string,
      Array<{ start: number; end: number }>
    >();

    for (const comment of observationComments.data) {
      // Only process comments with position data (inline comments)
      if (
        comment.dataField &&
        comment.path &&
        comment.path.length > 0 &&
        comment.rangeStart &&
        comment.rangeEnd
      ) {
        // Build ranges from rangeStart/rangeEnd arrays (supports multi-selection)
        const ranges = comment.rangeStart.map((start, i) => ({
          start,
          end: comment.rangeEnd[i]!,
        }));

        // path is an array of JSON path strings (e.g., ["$.messages[0].content"])
        for (const jsonPath of comment.path) {
          let targetMap;
          if (comment.dataField === "input") targetMap = inputMap;
          else if (comment.dataField === "output") targetMap = outputMap;
          else if (comment.dataField === "metadata") targetMap = metadataMap;
          else continue;

          const existing = targetMap.get(jsonPath) || [];
          targetMap.set(jsonPath, [...existing, ...ranges]);
        }
      }
    }

    return {
      input: inputMap.size > 0 ? inputMap : undefined,
      output: outputMap.size > 0 ? outputMap : undefined,
      metadata: metadataMap.size > 0 ? metadataMap : undefined,
    };
  }, [observationComments.data]);

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

  // Format cost and usage values
  const totalCost = observation.totalCost;
  const totalUsage = observation.totalUsage;
  const inputUsage = observation.inputUsage;
  const outputUsage = observation.outputUsage;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header section */}
      <div className="flex-shrink-0 space-y-2 border-b p-4">
        {/* Title row with actions */}
        <div className="grid w-full grid-cols-1 items-start gap-2 @2xl:grid-cols-[auto,auto] @2xl:justify-between">
          <div className="flex w-full flex-row items-start gap-1">
            <div className="mt-1.5">
              <ItemBadge type={observation.type as ObservationType} isSmall />
            </div>
            <span className="mb-0 ml-1 line-clamp-2 min-w-0 break-all font-medium md:break-normal md:break-words">
              {observation.name || observation.id}
            </span>
            <CopyIdsPopover
              idItems={[
                { id: traceId, name: "Trace ID" },
                { id: observation.id, name: "Observation ID" },
              ]}
            />
          </div>
          {/* Action buttons */}
          <div className="flex h-full flex-wrap content-start items-start justify-start gap-0.5 @2xl:mr-1 @2xl:justify-end">
            {observationWithIOCompat.data && (
              <NewDatasetItemFromExistingObject
                traceId={traceId}
                observationId={observation.id}
                projectId={projectId}
                input={observationWithIOCompat.data.input}
                output={observationWithIOCompat.data.output}
                metadata={observationWithIOCompat.data.metadata}
                key={observation.id}
                size="sm"
              />
            )}
            <div className="flex items-start">
              <AnnotateDrawer
                key={"annotation-drawer-" + observation.id}
                projectId={projectId}
                scoreTarget={{
                  type: "trace",
                  traceId: traceId,
                  observationId: observation.id,
                }}
                scores={observationScores}
                scoreMetadata={{
                  projectId: projectId,
                  environment: observation.environment,
                }}
                size="sm"
              />
              <CreateNewAnnotationQueueItem
                projectId={projectId}
                objectId={observation.id}
                objectType={AnnotationQueueObjectType.OBSERVATION}
                size="sm"
              />
            </div>
            {observationWithIOCompat.data &&
              isGenerationLike(observationWithIOCompat.data.type) && (
                <JumpToPlaygroundButton
                  source="generation"
                  generation={observationWithIOCompat.data}
                  analyticsEventName="trace_detail:test_in_playground_button_click"
                  size="sm"
                />
              )}
            <CommentDrawerButton
              projectId={projectId}
              objectId={observation.id}
              objectType="OBSERVATION"
              count={comments.get(observation.id)}
              size="sm"
              pendingSelection={pendingSelection}
              onSelectionUsed={handleSelectionUsed}
              isOpen={isCommentDrawerOpen}
              onOpenChange={setIsCommentDrawerOpen}
            />
          </div>
        </div>

        {/* Metadata badges */}
        <div className="flex flex-col gap-1">
          {/* Timestamp on its own row */}
          <div className="flex items-center">
            <LocalIsoDate
              date={observation.startTime}
              accuracy="millisecond"
              className="text-xs"
            />
          </div>
          {/* Other badges on second row */}
          <div className="flex flex-wrap items-center gap-1">
            <LatencyBadge latencySeconds={latencySeconds} />
            <TimeToFirstTokenBadge
              timeToFirstToken={observation.timeToFirstToken}
            />
            <EnvironmentBadge environment={observation.environment} />
            <CostBadge
              totalCost={totalCost}
              costDetails={observation.costDetails}
            />
            <UsageBadge
              type={observation.type}
              inputUsage={inputUsage}
              outputUsage={outputUsage}
              totalUsage={totalUsage}
              usageDetails={observation.usageDetails}
            />
            <VersionBadge version={observation.version} />
            <ModelBadge
              model={observation.model}
              internalModelId={observation.internalModelId}
              projectId={projectId}
              usageDetails={observation.usageDetails}
            />
            <ModelParametersBadges
              modelParameters={observation.modelParameters}
            />
            <LevelBadge level={observation.level} />
            <StatusMessageBadge statusMessage={observation.statusMessage} />
            {observation.promptId && (
              <PromptBadge
                promptId={observation.promptId}
                projectId={projectId}
              />
            )}
          </div>
        </div>
      </div>

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
            <Tabs
              className="ml-auto mr-1 h-fit px-2 py-0.5"
              value={currentView}
              onValueChange={(value) => {
                setViewPref(value === "json" ? "json" : "formatted");
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

        {/* Preview tab content */}
        <TabsBarContent
          value="preview"
          className="mt-0 flex max-h-full min-h-0 w-full flex-1"
        >
          <div className="flex w-full flex-col gap-2 overflow-y-auto">
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
              enableInlineComments={true}
              onAddInlineComment={handleAddInlineComment}
              commentedPathsByField={commentedPathsByField}
            />
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
