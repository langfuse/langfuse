import { type ScoreDomain } from "@langfuse/shared";

import { ScoreTag } from "@/src/components/ScoreTag";
import { IOSection } from "@/src/components/ui/IOSection";
import { CORRECTED_OUTPUT_SECTION_ID } from "@/src/features/traces/components/correctedOutputFocus";

import { useCorrectionData } from "../hooks/useCorrectionData";
import { CorrectedOutputField } from "./CorrectedOutputField";

type CorrectedOutputSectionProps = {
  projectId: string;
  traceId: string;
  environment: string;
  /** Observation (or TraceDetailView) output used as the obs / single-scope baseline. */
  actualOutput?: unknown;
  actualOutputTooLarge?: boolean;
  /**
   * Trace-level original output for the Trace correction field's diff.
   * Required when nesting Trace + Observation — never reuse the obs output.
   */
  traceActualOutput?: unknown;
  traceActualOutputTooLarge?: boolean;
  /** Observation-scoped CORRECTION (`observationId` set). */
  outputCorrection?: ScoreDomain | null;
  /** Trace-scoped CORRECTION (`observationId` null). */
  traceOutputCorrection?: ScoreDomain | null;
  /** When set, obs-scoped pen / field writes use this id. Omitted on TraceDetailView. */
  observationId?: string;
  compact?: boolean;
  trigger?: "inline" | "header";
  startEditing?: boolean;
  onClosed?: () => void;
  /** True while the Output-header pen opened an empty obs-scoped editor. */
  obsEditorOpen?: boolean;
  /** True while the Output-header pen opened an empty trace-scoped editor (TraceDetailView). */
  traceEditorOpen?: boolean;
  /**
   * Host already owns the section title (JSON Beta). Skip the outer
   * "Corrected output" IOSection when nesting Trace + Observation.
   */
  embedded?: boolean;
};

export type CorrectedOutputVisibility = {
  showTrace: boolean;
  showObs: boolean;
};

/**
 * Pure visibility for Corrected output. Gate mounts in the parent with
 * {@link shouldShowCorrectedOutputSection}; the section uses the same rules
 * (plus cache-backed values) when deciding nested vs single-scope layout.
 */
export function getCorrectedOutputVisibility(args: {
  observationId?: string;
  outputCorrection?: ScoreDomain | null;
  traceOutputCorrection?: ScoreDomain | null;
  obsEditorOpen?: boolean;
  traceEditorOpen?: boolean;
  startEditing?: boolean;
  trigger?: "inline" | "header";
}): CorrectedOutputVisibility {
  // Session synthetic rows still pass a null-obs correction as outputCorrection
  // with no observationId — treat that as trace scope.
  const legacyTraceCorrection =
    !args.observationId && args.outputCorrection ? args.outputCorrection : null;

  const showTrace =
    Boolean(args.traceOutputCorrection) ||
    Boolean(args.traceEditorOpen) ||
    Boolean(legacyTraceCorrection) ||
    // Pure Trace detail JSON (inline): empty create field mounts without a pen.
    (!args.observationId && args.trigger === "inline");

  const showObs =
    Boolean(args.observationId) &&
    (Boolean(args.outputCorrection) ||
      Boolean(args.obsEditorOpen) ||
      Boolean(args.startEditing) ||
      args.trigger === "inline");

  return { showTrace, showObs };
}

/** Whether CorrectedOutputSection has anything to mount. Gate in the parent. */
export function shouldShowCorrectedOutputSection(
  args: Parameters<typeof getCorrectedOutputVisibility>[0],
): boolean {
  const { showTrace, showObs } = getCorrectedOutputVisibility(args);
  return showTrace || showObs;
}

/**
 * Mounts Corrected output above Additional Input. Nested Trace / Observation
 * subheaders only when both scopes are visible; otherwise a single field.
 * Parent must gate with {@link shouldShowCorrectedOutputSection}.
 */
export function CorrectedOutputSection({
  projectId,
  traceId,
  environment,
  actualOutput,
  actualOutputTooLarge,
  traceActualOutput,
  traceActualOutputTooLarge,
  outputCorrection,
  traceOutputCorrection,
  observationId,
  compact = false,
  trigger = "inline",
  startEditing = false,
  onClosed,
  obsEditorOpen = false,
  traceEditorOpen = false,
  embedded = false,
}: CorrectedOutputSectionProps) {
  // Same cache-backed merge parents use for gating — remounts (Formatted/Raw)
  // must still see a just-saved obs correction while server scores lag.
  const { effectiveCorrection: effectiveObsCorrection } = useCorrectionData(
    outputCorrection,
    observationId,
    traceId,
  );
  const { effectiveCorrection: effectiveTraceCorrection } = useCorrectionData(
    // Legacy session path: null-obs correction arrives as outputCorrection.
    traceOutputCorrection ?? (!observationId ? outputCorrection : null),
    undefined,
    traceId,
  );

  const { showTrace, showObs } = getCorrectedOutputVisibility({
    observationId,
    outputCorrection: effectiveObsCorrection,
    traceOutputCorrection: effectiveTraceCorrection,
    obsEditorOpen,
    traceEditorOpen,
    startEditing,
    trigger,
  });

  const shared = {
    projectId,
    traceId,
    environment,
  };

  // Both scopes on this view → level subheaders under one Corrected output.
  if (showTrace && showObs) {
    // Trace field must not diff against the selected observation's output.
    const traceHasBaseline =
      traceActualOutput !== undefined || Boolean(traceActualOutputTooLarge);
    const nested = (
      <>
        <CorrectionLevelBlock level="trace">
          <CorrectedOutputField
            {...shared}
            actualOutput={traceHasBaseline ? traceActualOutput : undefined}
            actualOutputTooLarge={traceActualOutputTooLarge}
            hideDiff={!traceHasBaseline}
            existingCorrection={effectiveTraceCorrection}
            compact
            trigger="header"
          />
        </CorrectionLevelBlock>
        <CorrectionLevelBlock level="observation">
          <CorrectedOutputField
            {...shared}
            actualOutput={actualOutput}
            actualOutputTooLarge={actualOutputTooLarge}
            existingCorrection={effectiveObsCorrection}
            observationId={observationId}
            compact
            trigger={trigger}
            startEditing={startEditing}
            onClosed={onClosed}
          />
        </CorrectionLevelBlock>
      </>
    );

    return (
      <div
        id={CORRECTED_OUTPUT_SECTION_ID}
        data-section-key={CORRECTED_OUTPUT_SECTION_ID}
        className={embedded ? undefined : "pt-2"}
      >
        {embedded ? (
          nested
        ) : (
          <IOSection title="Corrected output">{nested}</IOSection>
        )}
      </div>
    );
  }

  // Single scope → plain Corrected output (no Trace/Observation subheaders).
  // TraceDetailView / session synthetic row: no observationId → trace writes.
  const isTraceOnly = showTrace && !showObs;
  return (
    <div
      id={CORRECTED_OUTPUT_SECTION_ID}
      data-section-key={CORRECTED_OUTPUT_SECTION_ID}
    >
      {isTraceOnly ? (
        <CorrectedOutputField
          {...shared}
          actualOutput={
            traceActualOutput !== undefined ? traceActualOutput : actualOutput
          }
          actualOutputTooLarge={
            traceActualOutput !== undefined
              ? traceActualOutputTooLarge
              : actualOutputTooLarge
          }
          existingCorrection={effectiveTraceCorrection}
          compact={compact}
          trigger={trigger}
          startEditing={startEditing}
          onClosed={onClosed}
        />
      ) : (
        <CorrectedOutputField
          {...shared}
          actualOutput={actualOutput}
          actualOutputTooLarge={actualOutputTooLarge}
          existingCorrection={effectiveObsCorrection}
          observationId={observationId}
          compact={compact}
          trigger={trigger}
          startEditing={startEditing}
          onClosed={onClosed}
        />
      )}
    </div>
  );
}

function CorrectionLevelBlock({
  level,
  children,
}: {
  level: "trace" | "observation";
  children: React.ReactNode;
}) {
  return (
    <div className="border-border border-t first:border-t-0">
      <div className="flex items-center gap-1.5 px-0 pt-2 pb-0.5">
        <ScoreTag level={level} />
      </div>
      {children}
    </div>
  );
}
