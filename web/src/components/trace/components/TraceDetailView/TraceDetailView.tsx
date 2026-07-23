/**
 * TraceDetailView - Shows trace-level details when no observation is selected
 *
 * The Scores tab + ScoresTable were removed per the consolidation decision
 * register (scores render in the compact Scores accordion below the I/O).
 * With only Preview left, the tabs machinery collapsed into the slim
 * SidePanelToolbar shared with TraceSidePanel.
 */

import { type TraceDomain, type ScoreDomain } from "@langfuse/shared";
import { type ObservationReturnTypeWithMetadata } from "@/src/server/api/routers/traces";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { useCallback, useMemo, useState } from "react";
import { type SelectionData } from "@/src/features/comments/contexts/InlineCommentSelectionContext";
import { api } from "@/src/utils/api";

// Preview tab components
import { IOPreview } from "@/src/components/trace/components/IOPreview/IOPreview";
import TagList from "@/src/features/tag/components/TagList";
import { useJsonExpansion } from "@/src/components/trace/contexts/JsonExpansionContext";
import { useMedia } from "@/src/components/trace/api/useMedia";
import { useParsedTrace } from "@/src/hooks/useParsedTrace";

// Contexts and hooks
import { useTraceData } from "@/src/components/trace/contexts/TraceDataContext";
import { useViewPreferences } from "@/src/components/trace/contexts/ViewPreferencesContext";
import { useCommentedPaths } from "@/src/features/comments/hooks/useCommentedPaths";

// Extracted components
import { TraceDetailViewHeader } from "./TraceDetailViewHeader";
import { ZoneDivider } from "@/src/components/trace/components/_shared/InspectorElements";
import {
  MetadataAccordion,
  ScoresAccordion,
} from "@/src/components/trace/components/_shared/DetailAccordions";
import { SidePanelToolbar } from "@/src/components/trace-side-panel/SidePanelToolbar";
import { PrettyJsonView } from "@/src/components/ui/PrettyJsonView";
import { type MetadataFilterActions } from "@/src/components/table/ValueCell";
import { deepParseJson } from "@langfuse/shared";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { useCorrectionData } from "@/src/components/trace/components/IOPreview/components/hooks/useCorrectionData";
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

  // Annotate drawer state is view-owned so both the header "+ Add to" menu
  // and the Scores accordion's "+ Add score" can open the same drawer.
  const [isAnnotateDrawerOpen, setIsAnnotateDrawerOpen] = useState(false);
  const hasAnnotationAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });

  // Get jsonViewPreference directly from ViewPreferencesContext for "json-beta" support
  const {
    jsonViewPreference,
    setJsonViewPreference,
    jsonBetaEnabled,
    setJsonBetaEnabled,
    isAnnotationMode,
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

  // Metadata for the accordion in the details zone — same parse fallback
  // IOPreviewPretty used before metadata moved out of it (showMetadata=false).
  const accordionMetadata = useMemo(
    () =>
      isParsing
        ? undefined
        : (parsedMetadata ??
          deepParseJson(trace.metadata, { maxSize: 100_000, maxDepth: 2 })),
    [isParsing, parsedMetadata, trace.metadata],
  );
  const metadataItemCount =
    accordionMetadata !== null &&
    typeof accordionMetadata === "object" &&
    !Array.isArray(accordionMetadata)
      ? Object.keys(accordionMetadata).length
      : 1;
  const metadataActions = useMemo<MetadataFilterActions>(
    () => ({ projectId, filterTarget: "traces" }),
    [projectId],
  );

  const outputCorrection = getMostRecentCorrection(traceCorrections);

  // Corrected-output visibility (decision register): hidden until the user
  // clicks the "Correct" toggle — INCLUDING when a correction already exists.
  // The toggle indicates an existing correction (dot + "Has correction"
  // title). Annotation mode keeps the previous always-on behavior — the
  // toolbar hosting the toggle is hidden there.
  const [isCorrectionOpen, setIsCorrectionOpen] = useState(false);
  const { correctionValue: existingCorrectionValue } = useCorrectionData(
    outputCorrection,
    undefined,
    trace.id,
  );
  const hasExistingCorrection = existingCorrectionValue.trim().length > 0;
  const showCorrections = isAnnotationMode || isCorrectionOpen;

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
        isAnnotateDrawerOpen={isAnnotateDrawerOpen}
        onAnnotateDrawerOpenChange={setIsAnnotateDrawerOpen}
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
            hasAnnotationAccess
              ? {
                  isOpen: isCorrectionOpen,
                  hasExisting: hasExistingCorrection,
                  onToggle: () => setIsCorrectionOpen((current) => !current),
                }
              : undefined
          }
        />
      )}

      {/* Body */}
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
              className={`px-2 pt-2 text-sm font-bold ${currentView !== "pretty" ? "shrink-0" : ""}`}
            >
              Tags
            </div>
            <div
              className={`flex flex-wrap gap-x-1 gap-y-1 px-2 pb-2 ${currentView !== "pretty" ? "shrink-0" : ""}`}
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
          enableInlineComments={true}
          onAddInlineComment={handleAddInlineComment}
          commentedPathsByField={commentedPathsByField}
          showMetadata={false}
          onVirtualizationChange={setIsJSONBetaVirtualized}
          projectId={projectId}
          traceId={trace.id}
          environment={trace.environment}
          showCorrections={showCorrections}
        />
        {/* Details zone: Scores + Metadata accordions, per the inspector
            design. Skipped in virtualized JSON Beta (IOPreview owns the
            scroll there). Metadata accordion only in the formatted view —
            the JSON views still render metadata inline themselves. */}
        {!(currentView === "json-beta" && isJSONBetaVirtualized) && (
          <>
            <div className="h-4 w-full shrink-0" />
            <ZoneDivider />
            <div className="shrink-0 px-3 pt-1">
              <ScoresAccordion
                scores={traceScores}
                hasAnnotationAccess={hasAnnotationAccess && !isAnnotationMode}
                onAddScore={() => setIsAnnotateDrawerOpen(true)}
              />
              {currentView === "pretty" && accordionMetadata !== undefined && (
                <>
                  <div className="border-t" />
                  <MetadataAccordion itemCount={metadataItemCount}>
                    <div className="[&_.io-message-content]:px-2 [&_.io-message-header]:px-2">
                      <PrettyJsonView
                        title="Metadata"
                        json={accordionMetadata}
                        isParsing={isParsing}
                        media={
                          traceMedia.data?.filter(
                            (m) => m.field === "metadata",
                          ) ?? []
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
