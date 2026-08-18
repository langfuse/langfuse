import { LayoutGrid, Sparkles } from "lucide-react";
import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { EvaluatorEmptyStateStartingPoint } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

function startingPointSelectHandler(
  startingPoint: EvaluatorEmptyStateStartingPoint,
  onDetectTopics: () => void,
  onSelectTemplate: (template: GalleryTemplate) => void,
) {
  switch (startingPoint.action) {
    case "detect-topics":
      return onDetectTopics;
    case "select-template":
      return () => onSelectTemplate(startingPoint.template);
  }
}

function StartingPointCard({
  startingPoint,
  onSelect,
}: {
  startingPoint: EvaluatorEmptyStateStartingPoint;
  onSelect: () => void;
}) {
  const { type } = getGalleryTemplatePresentation(startingPoint.template);
  const {
    icon: Icon,
    iconClassName,
    edgeClassName,
  } = getGalleryCategoryPresentation(startingPoint.categoryKey);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "bg-background hover:bg-muted/40 flex min-h-44 cursor-pointer flex-col gap-3 rounded-lg border border-l-2 p-4 text-left transition-colors",
        edgeClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-bold" title={startingPoint.title}>
          {startingPoint.title}
        </span>
        <p className="text-muted-foreground text-xs leading-relaxed">
          {startingPoint.description}
        </p>
      </div>
      <div className="mt-auto flex items-end justify-between gap-2">
        <span className="text-muted-foreground text-xs">
          {startingPoint.audience}
        </span>
        <span className="text-xs font-bold">Set up →</span>
      </div>
    </button>
  );
}

function BrowseLibraryCard({
  templateCount,
  onBrowseLibrary,
}: {
  templateCount: number;
  onBrowseLibrary: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onBrowseLibrary}
      className="bg-muted/50 hover:bg-muted flex min-h-44 cursor-pointer flex-col gap-3 rounded-lg border p-4 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <LayoutGrid className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs">
          {templateCount} templates
        </span>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-bold">Browse all templates</span>
        <p className="text-muted-foreground text-xs leading-relaxed">
          Search by what you want to measure — quality, retrieval, safety,
          classifiers, coding agents.
        </p>
      </div>
      <div className="mt-auto flex items-end justify-end">
        <span className="text-xs font-bold">Browse library →</span>
      </div>
    </button>
  );
}

export function EvaluatorsEmptyStateView({
  startingPoints,
  templateCount,
  docsHref,
  onSelectTemplate,
  onDetectTopics,
  onBrowseLibrary,
}: {
  startingPoints: EvaluatorEmptyStateStartingPoint[];
  templateCount: number;
  docsHref: string;
  onSelectTemplate: (template: GalleryTemplate) => void;
  onDetectTopics: () => void;
  onBrowseLibrary: () => void;
}) {
  const { iconClassName } = getGalleryCategoryPresentation("recommended");

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-8 pt-3 pb-6">
      <div className="mb-6 max-w-2xl text-center">
        <h2 className="mb-2 text-2xl font-bold">
          Turn traces into quality signals
        </h2>
        <p className="text-muted-foreground text-base">
          Evaluators score your data with an LLM-as-a-judge or with code. Run
          them on a sample of production traces to catch patterns and
          regressions, or on dataset runs to compare changes before you ship.
        </p>
      </div>

      <div className="flex w-full flex-col gap-3">
        <h3 className="text-muted-foreground flex items-center gap-1.5 text-xs font-bold">
          <Sparkles className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
          Recommended starting points
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {startingPoints.map((startingPoint) => (
            <StartingPointCard
              key={startingPoint.template.key}
              startingPoint={startingPoint}
              onSelect={startingPointSelectHandler(
                startingPoint,
                onDetectTopics,
                onSelectTemplate,
              )}
            />
          ))}
          <BrowseLibraryCard
            templateCount={templateCount}
            onBrowseLibrary={onBrowseLibrary}
          />
        </div>
      </div>

      <p className="text-muted-foreground mt-6 max-w-2xl text-center text-sm">
        You choose where each evaluator runs. Live traces or dataset runs, and
        test it on real data before activating.{" "}
        <a
          href={docsHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-link hover:text-link-hover"
        >
          How evaluators work.
        </a>
      </p>
    </div>
  );
}
