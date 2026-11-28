import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  X,
  type IconComponent,
} from "@langfuse/icons";
import { type ReactNode } from "react";
import { Button } from "@/src/components/design-system/Button/Button";
import { KeyboardShortcut } from "@/src/components/design-system/KeyboardShortcut/KeyboardShortcut";
import { Tabs } from "@/src/components/design-system/Tabs/Tabs";
import { cn } from "@/src/utils/tailwind";
import { coveragePercent, LOW_COVERAGE_PERCENT } from "../lib/similarity";
import {
  type AskAiInterpretation,
  type AskAiSemanticStatus,
  type FacetOption,
  type SemanticClause,
} from "../types";

type SemanticAskAiPromptProps = {
  prompt: string;
  /** The bar's current filters, shown and refined like in today's Ask AI. */
  refineContext: string;
  status: AskAiSemanticStatus;
  facets: FacetOption[];
  onPromptChange: (prompt: string) => void;
  onSubmit: (prompt: string) => void;
  onExit: () => void;
  onFacetChange: (facetId: string) => void;
  onRemoveFilter: (index: number) => void;
  onRemoveSemantic: () => void;
  onApply: (interpretation: AskAiInterpretation) => void;
};

/**
 * Ask AI for the tracing search bar, extended with search by meaning. The
 * model splits a prompt into grammar filters and a leftover phrase; the phrase
 * becomes a `similar:` clause matched against Topics summaries. Unlike today's
 * apply-immediately flow, the split is previewed so the user sees which part
 * is an exact filter and which is a ranked guess.
 */
export function SemanticAskAiPrompt({
  prompt,
  refineContext,
  status,
  facets,
  onPromptChange,
  onSubmit,
  onExit,
  onFacetChange,
  onRemoveFilter,
  onRemoveSemantic,
  onApply,
}: SemanticAskAiPromptProps) {
  const pending = status.kind === "generating";
  const error = status.kind === "error" ? status.message : null;
  const refining = refineContext.trim().length > 0;
  const submit = () => {
    if (prompt.trim().length > 0 && !pending) onSubmit(prompt);
  };

  return (
    <div className="relative w-full">
      <div
        className={cn(
          "border-input bg-background rounded-md border px-2 py-0.5",
          "focus-within:ring-ring focus-within:ring-1",
          error && "border-destructive focus-within:ring-destructive/40",
        )}
      >
        {refining && (
          <div className="text-muted-foreground mb-1.5 flex min-w-0 items-center gap-1.5 pt-1 pl-1 text-xs">
            <span className="shrink-0">Refining</span>
            <code
              className="ph-no-capture bg-muted text-foreground/80 min-w-0 truncate rounded px-1.5 py-0.5 font-mono text-[11px]"
              title={refineContext}
            >
              {refineContext}
            </code>
          </div>
        )}
        <div className="flex min-h-6 items-center gap-2">
          <button
            type="button"
            aria-label="Back to search"
            title="Back (Esc)"
            onClick={onExit}
            className="text-muted-foreground hover:text-foreground hover:bg-accent -ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md"
          >
            <ArrowLeft size="base" aria-hidden />
          </button>
          <input
            type="text"
            value={prompt}
            disabled={pending}
            placeholder="Describe the traces — e.g. production errors where users ask for a refund to an expired card"
            aria-label="Ask AI to build filters"
            spellCheck={false}
            autoComplete="off"
            className="placeholder:text-muted-foreground min-w-0 flex-1 border-0 bg-transparent text-xs leading-6 outline-none focus:ring-0 focus:outline-none disabled:opacity-60"
            onChange={(event) => onPromptChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return;
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              } else if (event.key === "Escape") {
                event.preventDefault();
                onExit();
              }
            }}
          />
          {pending ? (
            <span className="text-muted-foreground flex shrink-0 items-center gap-1.5 pr-1 text-xs">
              <Loader2 size="base" __rawClassName="animate-spin" aria-hidden />
              Generating…
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <span className="hidden md:inline-flex">
                <KeyboardShortcut keys={["Escape"]} />
              </span>
              <button
                type="button"
                aria-label="Generate filters"
                title="Generate filters (Enter)"
                disabled={prompt.trim().length === 0}
                onClick={submit}
                className="text-muted-foreground hover:text-foreground hover:bg-accent inline-flex h-5 w-5 items-center justify-center rounded-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <ArrowRight size="base" aria-hidden />
              </button>
            </div>
          )}
        </div>
      </div>
      {error && (
        <div className="text-destructive mt-1 px-1 font-sans text-xs">
          {error}
        </div>
      )}
      {status.kind === "preview" && (
        <InterpretationPreview
          interpretation={status.interpretation}
          facets={facets}
          onFacetChange={onFacetChange}
          onRemoveFilter={onRemoveFilter}
          onRemoveSemantic={onRemoveSemantic}
          onApply={onApply}
        />
      )}
    </div>
  );
}

function InterpretationPreview({
  interpretation,
  facets,
  onFacetChange,
  onRemoveFilter,
  onRemoveSemantic,
  onApply,
}: Pick<
  SemanticAskAiPromptProps,
  "facets" | "onFacetChange" | "onRemoveFilter" | "onRemoveSemantic" | "onApply"
> & { interpretation: AskAiInterpretation }) {
  const { filters, semantic, semanticUnavailable, estimatedMatches } =
    interpretation;
  const empty = filters.length === 0 && semantic === null;
  return (
    <div
      aria-label="Ask AI preview"
      className="bg-background mt-1 flex flex-col gap-2.5 rounded-md border p-3 text-xs"
    >
      <PreviewRow label="Filters">
        {filters.length > 0 ? (
          filters.map((filter, index) => (
            <Token
              key={filter}
              text={filter}
              onRemove={() => onRemoveFilter(index)}
            />
          ))
        ) : (
          <span className="text-muted-foreground">None</span>
        )}
      </PreviewRow>
      {semantic ? (
        <SemanticRow
          semantic={semantic}
          facets={facets}
          onFacetChange={onFacetChange}
          onRemove={onRemoveSemantic}
        />
      ) : null}
      {semanticUnavailable ? (
        <p className="text-muted-foreground">
          Part of your prompt describes what users asked. Searching by meaning
          needs Topics on this project, so only the filters above apply.
        </p>
      ) : null}
      <div className="flex items-center justify-between gap-2 border-t pt-2.5">
        <span role="status" className="text-muted-foreground">
          {empty
            ? "Nothing to apply"
            : `~${estimatedMatches.toLocaleString("en-US")} traces${
                semantic ? ", ranked by meaning" : ""
              }`}
        </span>
        <Button
          size="sm"
          text="Apply"
          disabled={empty}
          onClick={() => onApply(interpretation)}
        />
      </div>
    </div>
  );
}

function SemanticRow({
  semantic,
  facets,
  onFacetChange,
  onRemove,
}: {
  semantic: SemanticClause;
  facets: FacetOption[];
  onFacetChange: (facetId: string) => void;
  onRemove: () => void;
}) {
  const percent = coveragePercent(semantic.coverage);
  const facetLabel =
    facets.find((facet) => facet.id === semantic.facetId)?.label ??
    semantic.facetId;
  return (
    <>
      <PreviewRow label="Meaning">
        <Token
          icon={Sparkles}
          text={`similar:"${semantic.text}"`}
          onRemove={onRemove}
        />
        {facets.length > 1 ? (
          <>
            <span className="text-muted-foreground">in</span>
            <Tabs value={semantic.facetId} onValueChange={onFacetChange}>
              <Tabs.List variant="inset" size="sm" aria-label="Summary facet">
                {facets.map((facet) => (
                  <Tabs.Trigger
                    key={facet.id}
                    value={facet.id}
                    label={facet.label}
                  />
                ))}
              </Tabs.List>
            </Tabs>
          </>
        ) : null}
      </PreviewRow>
      <p
        className={cn(
          "pl-18",
          percent < LOW_COVERAGE_PERCENT
            ? "text-dark-yellow"
            : "text-muted-foreground",
        )}
      >
        {percent < LOW_COVERAGE_PERCENT
          ? `Only ${percent}% of traces in this range have a summary for ${facetLabel}; the rest can't match.`
          : `Compared with each trace's ${facetLabel} summary from Topics.`}
      </p>
    </>
  );
}

function PreviewRow({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground w-16 shrink-0">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5">
        {children}
      </div>
    </div>
  );
}

function Token({
  text,
  icon: Icon,
  onRemove,
}: {
  text: string;
  icon?: IconComponent;
  onRemove: () => void;
}) {
  return (
    <span className="bg-muted text-foreground/80 inline-flex min-w-0 items-center gap-1 rounded py-0.5 pr-0.5 pl-1.5 font-mono text-[11px]">
      {Icon ? <Icon size="sm" aria-hidden /> : null}
      <span className="ph-no-capture truncate" title={text}>
        {text}
      </span>
      <button
        type="button"
        aria-label={`Remove ${text}`}
        onClick={onRemove}
        className="hover:bg-accent inline-flex size-4 items-center justify-center rounded-sm"
      >
        <X size="sm" aria-hidden />
      </button>
    </span>
  );
}
