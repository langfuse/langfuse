/**
 * Scores and Metadata accordions for the trace/observation details panel,
 * styled after the session inspector's ScoresSection / MetadataSection
 * (web/src/components/session/inspector/ObservationInspector.tsx):
 * eyebrow header, collapsed peek chips, rounded-full mono value pills.
 *
 * Purely presentational apart from the open/closed toggle; data and the
 * "+ Add score" behavior come from the owning view.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { EyebrowLabel } from "@/src/components/trace/components/_shared/InspectorElements";
import { cn } from "@/src/utils/tailwind";

/** Minimal structural score shape shared by trace- and observation-level scores. */
export type DetailAccordionScore = {
  id: string;
  name: string;
  value?: number | null;
  stringValue?: string | null;
};

const scoreValueLabel = (score: DetailAccordionScore): string => {
  if (score.stringValue) return score.stringValue;
  if (score.value === null || score.value === undefined) return "—";
  return Number.isInteger(score.value)
    ? String(score.value)
    : score.value.toFixed(2);
};

/** Rounded neutral pill for a score value (categorical, numeric, boolean). */
const ScoreValuePill = ({ label }: { label: string }) => (
  <span
    className="bg-muted/50 text-foreground inline-flex max-w-40 truncate rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold"
    title={label}
  >
    {label}
  </span>
);

/**
 * "SCORES" accordion: collapsed peek chips (up to 2 name:value pills + "+N"),
 * expanded rows with mono value pills and a quiet "+ Add score" control.
 */
export const ScoresAccordion = ({
  scores,
  onAddScore,
  hasAnnotationAccess,
}: {
  scores: DetailAccordionScore[];
  onAddScore: () => void;
  hasAnnotationAccess: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(true);
  const peekScores = scores.slice(0, 2);
  const remaining = scores.length - peekScores.length;

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 py-2.5"
      >
        <EyebrowLabel className="tracking-[0.1em]">Scores</EyebrowLabel>
        <span className="flex min-w-0 items-center gap-1.5">
          {!isOpen ? (
            <span className="flex min-w-0 items-center gap-1">
              {peekScores.map((score) => (
                <ScoreValuePill
                  key={score.id}
                  label={`${score.name}:${scoreValueLabel(score)}`}
                />
              ))}
              {remaining > 0 ? (
                <ScoreValuePill label={`+${remaining}`} />
              ) : null}
            </span>
          ) : null}
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 shrink-0 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
      </button>
      {isOpen ? (
        <div className="flex flex-col gap-1.5 pb-3">
          {scores.length > 0 ? (
            scores.map((score) => (
              <div
                key={score.id}
                className="flex items-center justify-between gap-2 rounded-sm border px-3 py-2"
              >
                <span className="min-w-0 truncate text-xs" title={score.name}>
                  {score.name}
                </span>
                <ScoreValuePill label={scoreValueLabel(score)} />
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-xs">No scores yet</p>
          )}
          {hasAnnotationAccess ? (
            <button
              type="button"
              onClick={onAddScore}
              className="text-muted-foreground hover:text-foreground mt-1 self-start text-xs"
            >
              <span className="font-mono">+</span> Add score
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
};

/**
 * "METADATA · N items" accordion shell. The body (`children`) is the full
 * metadata rendering the owning view previously delegated to IOPreview, so
 * the complete JSON machinery survives — just relocated behind the accordion.
 */
export const MetadataAccordion = ({
  itemCount,
  children,
}: {
  itemCount: number;
  children: ReactNode;
}) => {
  // Open by default: a collapsed accordion read as "metadata was removed".
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div>
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between gap-2 py-2.5"
      >
        <EyebrowLabel className="tracking-[0.1em]">Metadata</EyebrowLabel>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground font-mono text-[10px]">
            {itemCount} {itemCount === 1 ? "item" : "items"}
          </span>
          <ChevronDown
            className={cn(
              "text-muted-foreground h-3.5 w-3.5 transition-transform",
              isOpen ? "rotate-180" : "rotate-0",
            )}
          />
        </span>
      </button>
      {isOpen ? <div className="pb-3">{children}</div> : null}
    </div>
  );
};
