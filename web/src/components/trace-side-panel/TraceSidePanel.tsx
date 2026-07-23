/**
 * TraceSidePanel - the consolidated observation-details side panel.
 *
 * One presenter behind both observation-details surfaces:
 * - `variant="full"`: the trace page / table peek details panel (rendered by
 *   the ObservationDetailView adapter, fed from the trace contexts).
 * - `variant="observation-only"`: the session inspector panel (rendered by
 *   the SessionObservationSidePanel adapter, fed from the session events
 *   queries). Gains the close button and the "Open Trace View" escape hatch;
 *   the full variant IS the trace view.
 *
 * Layout: header (title + actions + overview grid) / toolbar (Formatted-JSON
 * toggle, JSON Beta switch, Correct toggle) / body (IOPreview) / details zone
 * (Scores + Metadata accordions).
 *
 * The presenter is props-fed for all DATA. It reads two UI-preference
 * contexts both surfaces mount: ViewPreferencesContext (view mode, JSON beta,
 * annotation mode) and JsonExpansionContext (expand/collapse persistence).
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { deepParseJson, type ScoreDomain } from "@langfuse/shared";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";
import { useCorrectionData } from "@/src/components/trace/components/IOPreview/components/hooks/useCorrectionData";
import { useJsonExpansion } from "@/src/components/trace/contexts/JsonExpansionContext";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { ZoneDivider } from "@/src/components/trace/components/_shared/InspectorElements";
import {
  MetadataAccordion,
  ScoresAccordion,
} from "@/src/components/trace/components/_shared/DetailAccordions";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { type MediaReturnType } from "@/src/features/media/validation";
import { type useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { type AggregatedTraceMetrics } from "@/src/components/trace/lib/trace-aggregation";
import type Decimal from "decimal.js";
import TagList from "@/src/features/tag/components/TagList";
import {
  TraceSidePanelHeader,
  type PlaygroundGeneration,
  type TraceSidePanelObservation,
} from "./TraceSidePanelHeader";
import { SidePanelToolbar } from "./SidePanelToolbar";
import { type AddToDropdownMenuProps } from "@/src/components/trace/components/_shared/AddToDropdownMenu";

export type { TraceSidePanelObservation, PlaygroundGeneration };

export interface TraceSidePanelIO {
  input?: unknown;
  output?: unknown;
  metadata?: unknown;
  parsedInput?: unknown;
  parsedOutput?: unknown;
  parsedMetadata?: unknown;
  isLoading: boolean;
  isParsing: boolean;
  media?: MediaReturnType[];
}

export interface TraceSidePanelProps {
  variant: "full" | "observation-only";
  projectId: string;
  traceId: string;
  observation: TraceSidePanelObservation;
  io: TraceSidePanelIO;
  observationScores: WithStringifiedMetadata<ScoreDomain>[];
  /** Most recent CORRECTION score for this observation (server + cache-merged). */
  outputCorrection?: ScoreDomain;
  commentCount?: number;
  playgroundGeneration?: PlaygroundGeneration | null;
  datasetPrefill?: AddToDropdownMenuProps["datasetPrefill"];
  annotateContent: ReactNode;
  addToMenuExtraItems?: ReactNode;
  /** Inline-comment highlighting (JSON Beta); adapter-supplied query result. */
  commentedPathsByField?: ReturnType<typeof useCommentedPaths>;
  enableInlineComments?: boolean;
  /** full variant: trace tags shown above the body for root observations. */
  traceTags?: string[];
  /** full variant: aggregated subtree metrics for root observations. */
  subtreeMetrics?: AggregatedTraceMetrics | null;
  treeNodeTotalCost?: Decimal;
  /** observation-only variant: close the inspector panel. */
  onClose?: () => void;
  /** observation-only variant: escape hatch to the trace view. */
  onOpenTraceView?: () => void;
  /** Rendered inside the Metadata accordion, below the values — e.g. the
      session adapter's "metadata capped, open the trace view" hint for
      metadataTruncated observations (LFE-10958). */
  metadataNotice?: ReactNode;
}

export function TraceSidePanel({
  variant,
  projectId,
  traceId,
  observation,
  io,
  observationScores,
  outputCorrection,
  commentCount,
  playgroundGeneration,
  datasetPrefill,
  annotateContent,
  addToMenuExtraItems,
  commentedPathsByField,
  enableInlineComments = false,
  traceTags,
  subtreeMetrics,
  treeNodeTotalCost,
  onClose,
  onOpenTraceView,
  metadataNotice,
}: TraceSidePanelProps) {
  // UI-preference contexts (both surfaces mount the providers)
  const {
    jsonViewPreference,
    setJsonViewPreference,
    jsonBetaEnabled,
    setJsonBetaEnabled,
    isAnnotationMode,
  } = useViewPreferences();
  const {
    formattedExpansion,
    setFormattedFieldExpansion,
    jsonExpansion,
    setJsonFieldExpansion,
    advancedJsonExpansion,
    setAdvancedJsonExpansion,
  } = useJsonExpansion();

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

  // Inline-comment selection state (drawer hosted in the header)
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

  // Annotate drawer state is panel-owned so both the header "+ Add to" menu
  // and the Scores accordion's "+ Add score" can open the same drawer.
  const [isAnnotateDrawerOpen, setIsAnnotateDrawerOpen] = useState(false);
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  // Corrected-output visibility (decision register): the editor stays hidden
  // until the user clicks the "Correct" toggle — INCLUDING when a correction
  // already exists. The toggle itself indicates an existing correction (dot +
  // "Has correction" title) so the hidden data stays discoverable. Annotation
  // mode keeps its previous always-on behavior — the toolbar hosting the
  // toggle is hidden there.
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const { correctionValue: existingCorrectionValue } = useCorrectionData(
    outputCorrection,
    observation.id,
    traceId,
  );
  const hasExistingCorrection = existingCorrectionValue.trim().length > 0;
  // Correct is strictly GENERATION (per the inspector design);
  // isGenerationLike is wider (AGENT, TOOL, ...) and would leak it.
  const isGeneration = observation.type === "GENERATION";
  const showCorrections = isAnnotationMode || isCorrectionOpen;

  // Metadata for the accordion in the details zone — same parse fallback
  // IOPreviewPretty used before metadata moved out of it (showMetadata=false).
  const accordionMetadata = useMemo(
    () =>
      io.isParsing
        ? undefined
        : (io.parsedMetadata ??
          deepParseJson(io.metadata, {
            maxSize: 100_000,
            maxDepth: 2,
          })),
    [io.isParsing, io.parsedMetadata, io.metadata],
  );
  const metadataItemCount =
    accordionMetadata !== null &&
    typeof accordionMetadata === "object" &&
    !Array.isArray(accordionMetadata)
      ? Object.keys(accordionMetadata).length
      : 1;
  const metadataActions = useMemo<MetadataFilterActions>(
    () => ({ projectId, filterTarget: "observations" }),
    [projectId],
  );

  // Calculate latency in seconds if not provided
  const latencySeconds = useMemo(() => {
    if (observation.latency != null) {
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
      <TraceSidePanelHeader
        variant={variant}
        observation={observation}
        projectId={projectId}
        traceId={traceId}
        latencySeconds={latencySeconds}
        playgroundGeneration={playgroundGeneration ?? null}
        datasetPrefill={datasetPrefill}
        annotateContent={annotateContent}
        addToMenuExtraItems={addToMenuExtraItems}
        hasExistingScores={observationScores.length > 0}
        commentCount={commentCount}
        pendingSelection={pendingSelection}
        onSelectionUsed={handleSelectionUsed}
        isCommentDrawerOpen={isCommentDrawerOpen}
        onCommentDrawerOpenChange={setIsCommentDrawerOpen}
        isAnnotateDrawerOpen={isAnnotateDrawerOpen}
        onAnnotateDrawerOpenChange={setIsAnnotateDrawerOpen}
        isAnnotationMode={isAnnotationMode}
        subtreeMetrics={subtreeMetrics}
        treeNodeTotalCost={treeNodeTotalCost}
        onOpenTraceView={onOpenTraceView}
        onClose={onClose}
      />

      {/* Zone divider between header/overview and the body */}
      <ZoneDivider />

      {/* Toolbar — hidden in annotation mode (like the old tabs bar) */}
      {!isAnnotationMode && (
        <SidePanelToolbar
          showViewToggle={isPrettyViewAvailable || selectedViewTab === "json"}
          selectedViewTab={selectedViewTab}
          onViewTabChange={handleViewTabChange}
          jsonBetaEnabled={jsonBetaEnabled}
          onBetaToggle={handleBetaToggle}
          correction={
            isGeneration && hasAnnotationAccess
              ? {
                  isOpen: isCorrectionOpen,
                  hasExisting: hasExistingCorrection,
                  onToggle: () => setIsCorrectionOpen((current) => !current),
                }
              : undefined
          }
        />
      )}

      {/* Body. data-panel-markdown-scale caps markdown heading sizes to the
          panel's text scale (see globals.css) — LLM output `##` headings
          should not dwarf the adjacent JSON/table sections. */}
      <div
        data-panel-markdown-scale
        className={`flex min-h-0 w-full flex-1 flex-col ${
          currentView === "json-beta" && isJSONBetaVirtualized
            ? "overflow-hidden"
            : "overflow-auto pb-4"
        }`}
      >
        {traceTags && traceTags.length > 0 && (
          <>
            <div
              className={`px-2 pt-2 text-sm font-bold ${currentView !== "pretty" ? "shrink-0" : ""}`}
            >
              Tags
            </div>
            <div
              className={`flex flex-wrap gap-x-1 gap-y-1 px-2 pb-2 ${currentView !== "pretty" ? "shrink-0" : ""}`}
            >
              <TagList selectedTags={traceTags} isLoading={false} />
            </div>
          </>
        )}
        <IOPreview
          key={observation.id}
          observationName={observation.name ?? undefined}
          input={io.input ?? undefined}
          output={io.output ?? undefined}
          outputCorrection={outputCorrection}
          metadata={io.metadata ?? undefined}
          parsedInput={io.parsedInput}
          parsedOutput={io.parsedOutput}
          parsedMetadata={io.parsedMetadata}
          isLoading={io.isLoading}
          isParsing={io.isParsing}
          media={io.media}
          currentView={currentView}
          setIsPrettyViewAvailable={setIsPrettyViewAvailable}
          inputExpansionState={formattedExpansion.input}
          outputExpansionState={formattedExpansion.output}
          metadataExpansionState={formattedExpansion.metadata}
          onInputExpansionChange={(exp) =>
            setFormattedFieldExpansion("input", exp as Record<string, boolean>)
          }
          onOutputExpansionChange={(exp) =>
            setFormattedFieldExpansion("output", exp as Record<string, boolean>)
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
          enableInlineComments={enableInlineComments}
          onAddInlineComment={
            enableInlineComments ? handleAddInlineComment : undefined
          }
          commentedPathsByField={commentedPathsByField}
          showMetadata={false}
          observationId={observation.id}
          onVirtualizationChange={setIsJSONBetaVirtualized}
          projectId={projectId}
          traceId={traceId}
          environment={observation.environment ?? undefined}
          showCorrections={showCorrections}
        />
        {currentView !== "json-beta" && <div className="h-4 w-full shrink-0" />}
        {/* Details zone: Scores + Metadata accordions, per the inspector
            design. Skipped in virtualized JSON Beta (IOPreview owns the
            scroll there). Metadata lives in the accordion for both the
            formatted and the simple JSON view (showMetadata=false above);
            JSON Beta still renders metadata inline itself. */}
        {!(currentView === "json-beta" && isJSONBetaVirtualized) && (
          <>
            <ZoneDivider />
            <div className="shrink-0 px-3 pt-1">
              <ScoresAccordion
                scores={observationScores}
                hasAnnotationAccess={hasAnnotationAccess && !isAnnotationMode}
                onAddScore={() => setIsAnnotateDrawerOpen(true)}
              />
              {(currentView === "pretty" || currentView === "json") &&
                accordionMetadata !== undefined && (
                  <>
                    <div className="border-t" />
                    <MetadataAccordion itemCount={metadataItemCount}>
                      <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
                        <PrettyJsonView
                          title="Metadata"
                          json={accordionMetadata}
                          isLoading={io.isLoading}
                          isParsing={io.isParsing}
                          media={
                            io.media?.filter((m) => m.field === "metadata") ??
                            []
                          }
                          currentView="pretty"
                          externalExpansionState={formattedExpansion.metadata}
                          onExternalExpansionChange={(exp) =>
                            setFormattedFieldExpansion(
                              "metadata",
                              exp as Record<string, boolean>,
                            )
                          }
                          metadataActions={metadataActions}
                        />
                      </div>
                      {metadataNotice}
                    </MetadataAccordion>
                  </>
                )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
