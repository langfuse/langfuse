import { BotMessageSquare, LayoutGrid, Sparkles } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { EvaluatorEmptyStateStartingPoint } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

const recommendedCardClassName =
  "bg-background hover:bg-muted/40 flex h-full flex-col rounded-md border p-4 text-left transition-colors";

function StartingPointCardBody({
  startingPoint,
}: {
  startingPoint: EvaluatorEmptyStateStartingPoint;
}) {
  const { type } = getGalleryTemplatePresentation(startingPoint.template);

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Sparkles className="text-dark-yellow h-4 w-4 shrink-0" />
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <span
        className="mt-3 line-clamp-2 text-base font-bold"
        title={startingPoint.title}
      >
        {startingPoint.title}
      </span>
      <p
        className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed"
        title={startingPoint.description}
      >
        {startingPoint.description}
      </p>
    </>
  );
}

function DetectTopicsStartingPointCard({
  startingPoint,
  onDetectTopics,
  onSelectTemplate,
}: {
  startingPoint: Extract<
    EvaluatorEmptyStateStartingPoint,
    { action: "detect-topics" }
  >;
  onDetectTopics: () => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
}) {
  return (
    <div className={cn(recommendedCardClassName, "relative")}>
      <button
        type="button"
        onClick={() => onSelectTemplate(startingPoint.template)}
        aria-label={`Set up ${startingPoint.title}`}
        className="absolute inset-0 cursor-pointer rounded-md"
      />
      <div className="pointer-events-none relative flex h-full flex-col">
        <StartingPointCardBody startingPoint={startingPoint} />
        <div className="mt-auto flex justify-end pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={onDetectTopics}
            className="border-primary-accent/40 bg-primary-accent/10 text-primary-accent hover:bg-primary-accent/15 hover:text-primary-accent pointer-events-auto relative shrink-0 gap-1 px-2 text-xs"
          >
            <BotMessageSquare className="h-3 w-3" />
            Set up with AI
          </Button>
        </div>
      </div>
    </div>
  );
}

function TemplateStartingPointCard({
  startingPoint,
  onSelectTemplate,
}: {
  startingPoint: Extract<
    EvaluatorEmptyStateStartingPoint,
    { action: "select-template" }
  >;
  onSelectTemplate: (template: GalleryTemplate) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelectTemplate(startingPoint.template)}
      className={cn(recommendedCardClassName, "cursor-pointer")}
    >
      <StartingPointCardBody startingPoint={startingPoint} />
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
      className={cn(recommendedCardClassName, "cursor-pointer")}
    >
      <div className="flex items-start justify-between gap-2">
        <LayoutGrid className="text-muted-foreground h-4 w-4 shrink-0" />
        <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs">
          {templateCount} templates
        </span>
      </div>
      <span className="mt-3 line-clamp-2 text-base font-bold">
        Browse all templates
      </span>
      <p className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed">
        Search by what you want to measure — quality, retrieval, safety,
        classifiers, coding agents.
      </p>
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
          {startingPoints.map((startingPoint) => {
            switch (startingPoint.action) {
              case "detect-topics":
                return (
                  <DetectTopicsStartingPointCard
                    key={startingPoint.template.key}
                    startingPoint={startingPoint}
                    onDetectTopics={onDetectTopics}
                    onSelectTemplate={onSelectTemplate}
                  />
                );
              case "select-template":
                return (
                  <TemplateStartingPointCard
                    key={startingPoint.template.key}
                    startingPoint={startingPoint}
                    onSelectTemplate={onSelectTemplate}
                  />
                );
            }
          })}
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
