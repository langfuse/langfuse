import { type ScoreDomain } from "@langfuse/shared";

import { ScoreTag } from "@/src/components/ScoreTag";
import { IOSection } from "@/src/components/ui/IOSection";
import { CORRECTED_OUTPUT_SECTION_ID } from "@/src/features/traces/components/correctedOutputFocus";

import { CorrectedOutputField } from "./CorrectedOutputField";

type CorrectedOutputSectionProps = {
  projectId: string;
  traceId: string;
  environment: string;
  actualOutput?: unknown;
  actualOutputTooLarge?: boolean;
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
  /**
   * Host already owns the section title (JSON Beta). Skip the outer
   * "Corrected output" IOSection when nesting Trace + Observation.
   */
  embedded?: boolean;
};

/** Whether CorrectedOutputSection has anything to mount. Gate in the parent. */
export function shouldShowCorrectedOutputSection(args: {
  observationId?: string;
  outputCorrection?: ScoreDomain | null;
  traceOutputCorrection?: ScoreDomain | null;
  obsEditorOpen?: boolean;
  startEditing?: boolean;
  trigger?: "inline" | "header";
}): boolean {
  const showTrace = Boolean(args.traceOutputCorrection);
  const showObs =
    Boolean(args.observationId) &&
    (Boolean(args.outputCorrection) ||
      Boolean(args.obsEditorOpen) ||
      Boolean(args.startEditing) ||
      args.trigger === "inline");
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
  outputCorrection,
  traceOutputCorrection,
  observationId,
  compact = false,
  trigger = "inline",
  startEditing = false,
  onClosed,
  obsEditorOpen = false,
  embedded = false,
}: CorrectedOutputSectionProps) {
  const showTrace = Boolean(traceOutputCorrection);
  const showObs =
    Boolean(observationId) &&
    (Boolean(outputCorrection) ||
      obsEditorOpen ||
      startEditing ||
      trigger === "inline");

  const shared = {
    projectId,
    traceId,
    environment,
    actualOutput,
    actualOutputTooLarge,
  };

  // Both scopes on this view → level subheaders under one Corrected output.
  if (showTrace && showObs) {
    const nested = (
      <>
        <CorrectionLevelBlock level="trace">
          <CorrectedOutputField
            {...shared}
            existingCorrection={traceOutputCorrection}
            compact
            trigger="header"
          />
        </CorrectionLevelBlock>
        <CorrectionLevelBlock level="observation">
          <CorrectedOutputField
            {...shared}
            existingCorrection={outputCorrection}
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
  return (
    <div
      id={CORRECTED_OUTPUT_SECTION_ID}
      data-section-key={CORRECTED_OUTPUT_SECTION_ID}
    >
      {showTrace ? (
        <CorrectedOutputField
          {...shared}
          existingCorrection={traceOutputCorrection}
          compact={compact}
          trigger="header"
        />
      ) : (
        <CorrectedOutputField
          {...shared}
          existingCorrection={outputCorrection}
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
