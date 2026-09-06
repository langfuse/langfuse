import { BotMessageSquare, LayoutGrid } from "lucide-react";
import { Button } from "@/src/components/ui/button";
import {
  EvaluatorRecommendedCard,
  EvaluatorRecommendedCardContent,
  EvaluatorRecommendedCardSurface,
  EvaluatorRecommendedTemplateCardContent,
} from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGallerySection/components/EvaluatorRecommendedCard/EvaluatorRecommendedCard";
import { EvaluatorRecommendedCards } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGallerySection/components/EvaluatorRecommendedCards/EvaluatorRecommendedCards";
import { EVALUATOR_ACCENT_BUTTON_CLASSNAME } from "@/src/features/evals/v2/constants/evaluatorEmptyState";
import {
  getGalleryTemplateCategoryKey,
  getGalleryTemplatePresentation,
} from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { EvaluatorEmptyStateStartingPoint } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorEmptyState";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

function DetectTopicsStartingPointCard({
  startingPoint,
  onDetectTopics,
  onSelectTemplate,
}: {
  startingPoint: Extract<
    EvaluatorEmptyStateStartingPoint,
    { action: "detect-topics" }
  >;
  onDetectTopics?: () => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
}) {
  const { type } = getGalleryTemplatePresentation(startingPoint.template);

  return (
    <EvaluatorRecommendedCardSurface>
      <button
        type="button"
        onClick={() => onSelectTemplate(startingPoint.template)}
        aria-label={`Set up ${startingPoint.title}`}
        className="absolute inset-0 cursor-pointer rounded-md"
      />
      <div className="pointer-events-none relative flex h-full flex-col">
        <EvaluatorRecommendedTemplateCardContent
          title={startingPoint.title}
          description={startingPoint.description}
          type={type}
          categoryKey={getGalleryTemplateCategoryKey(startingPoint.template)}
        />
        {onDetectTopics ? (
          <div className="mt-auto flex justify-end pt-3">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onDetectTopics}
              className={cn(
                EVALUATOR_ACCENT_BUTTON_CLASSNAME,
                "pointer-events-auto relative shrink-0 gap-1 px-2 text-xs",
              )}
            >
              <BotMessageSquare className="h-3 w-3" />
              Set up with AI
            </Button>
          </div>
        ) : null}
      </div>
    </EvaluatorRecommendedCardSurface>
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
      className="h-full w-full cursor-pointer bg-transparent p-0 text-left"
    >
      <EvaluatorRecommendedCardSurface>
        <EvaluatorRecommendedCardContent
          icon={
            <LayoutGrid className="text-muted-foreground h-4 w-4 shrink-0" />
          }
          badge={
            <span className="bg-muted text-muted-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs">
              {templateCount} templates
            </span>
          }
          title="Browse all templates"
          description="Search by what you want to measure — quality, retrieval, safety, classifiers, coding agents."
        />
      </EvaluatorRecommendedCardSurface>
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
  onDetectTopics?: () => void;
  onBrowseLibrary: () => void;
}) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-8 pt-24 pb-8">
      <div className="mb-6 max-w-2xl text-center">
        <h2 className="mb-2 text-2xl font-bold">
          Turn traces into quality signals
        </h2>
        <p className="text-muted-foreground text-base">
          Evaluators score your data with an LLM-as-a-judge or with code. Run
          them on production traces to catch patterns, or on dataset runs to
          evaluate changes before you ship.{" "}
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

      <div className="w-full">
        <EvaluatorRecommendedCards label="Recommended starting points">
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
                  <EvaluatorRecommendedCard
                    key={startingPoint.template.key}
                    template={startingPoint.template}
                    onSelect={onSelectTemplate}
                  />
                );
            }
          })}
          <BrowseLibraryCard
            templateCount={templateCount}
            onBrowseLibrary={onBrowseLibrary}
          />
        </EvaluatorRecommendedCards>
      </div>
    </div>
  );
}
