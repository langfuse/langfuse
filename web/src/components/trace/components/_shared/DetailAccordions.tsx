/**
 * Scores and Metadata accordions for the trace/observation details panel,
 * styled after the session inspector's ScoresSection / MetadataSection
 * (web/src/components/session/inspector/ObservationInspector.tsx):
 * eyebrow header, collapsed peek chips, rounded-full mono value pills.
 *
 * Purely presentational apart from the open/closed toggle; data and the
 * "+ Add score" behavior come from the owning view.
 */

import { useCallback, useRef, useState, type ReactNode } from "react";
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
 * Collapsed height of the metadata body — matches the inspector's output cap
 * of 10 text-xs lines (12px × 1.625 leading ≈ 195px ≈ 200px).
 */
const METADATA_COLLAPSED_MAX_PX = 200;

/**
 * Measured max-height cap with the inspector's centered hairline
 * "Show more"/"Show less" control (the LineCappedText pattern). The body is
 * arbitrary content (PrettyJsonView), not plain text, so instead of a line
 * clamp the wrapper measures the content's natural height via a
 * ResizeObserver-backed callback ref and clips only when it actually
 * overflows the cap; no hidden-line count is shown because table rows have
 * no uniform line height. Expanding restores the full, interactive content.
 */
const HeightCappedContent = ({ children }: { children: ReactNode }) => {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const observerRef = useRef<ResizeObserver | null>(null);

  // Callback ref owns the observer lifecycle: attach on mount, re-check on
  // every content resize (JSON rows expand/collapse), detach on unmount.
  const measureRef = useCallback((node: HTMLDivElement | null) => {
    observerRef.current?.disconnect();
    observerRef.current = null;
    if (!node) return;
    const check = () =>
      setOverflows(node.scrollHeight > METADATA_COLLAPSED_MAX_PX + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(node);
    observerRef.current = observer;
  }, []);

  const isCollapsed = !expanded && overflows;

  const toggleControl = (label: string, rotated: boolean) => (
    <button
      type="button"
      onClick={() => setExpanded((current) => !current)}
      className="text-muted-foreground hover:text-foreground flex w-full items-center gap-2 pt-2"
    >
      <span className="border-border flex-1 border-t" />
      <span className="flex items-center gap-1.5 font-mono text-[11px] font-bold">
        {label}
        <ChevronDown
          className={cn("h-3 w-3", rotated ? "rotate-180" : "rotate-0")}
        />
      </span>
      <span className="border-border flex-1 border-t" />
    </button>
  );

  return (
    <div>
      <div
        className="overflow-hidden"
        style={
          isCollapsed ? { maxHeight: METADATA_COLLAPSED_MAX_PX } : undefined
        }
      >
        <div ref={measureRef}>{children}</div>
      </div>
      {isCollapsed ? toggleControl("Show more", false) : null}
      {expanded && overflows ? toggleControl("Show less", true) : null}
    </div>
  );
};

/**
 * "METADATA · N items" accordion shell. The body (`children`) is the full
 * metadata rendering the owning view previously delegated to IOPreview, so
 * the complete JSON machinery survives — just relocated behind the accordion.
 * The open body is height-capped (HeightCappedContent); `footer` renders
 * below the cap and stays visible while the body is clipped — e.g. the
 * session panel's truncated-metadata hint.
 */
export const MetadataAccordion = ({
  itemCount,
  children,
  footer,
}: {
  itemCount: number;
  children: ReactNode;
  footer?: ReactNode;
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
      {isOpen ? (
        <div className="pb-3">
          <HeightCappedContent>{children}</HeightCappedContent>
          {footer}
        </div>
      ) : null}
    </div>
  );
};
