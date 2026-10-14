import { EvaluatorRecommendedCard } from "@/src/features/evals/v2/components/EvaluatorRecommendedCard/EvaluatorRecommendedCard";
import { EvaluatorRecommendedCards } from "@/src/features/evals/v2/components/EvaluatorRecommendedCards/EvaluatorRecommendedCards";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

type EvaluatorsEmptyStateViewProps = {
  startingPoints: Extract<GalleryTemplate, { source: "managed" }>[];
  docsHref: string;
  onSelectTemplate: (template: GalleryTemplate) => void;
  onBrowseLibrary: () => void;
};

export function EvaluatorsEmptyStateView({
  startingPoints,
  docsHref,
  onSelectTemplate,
  onBrowseLibrary,
}: EvaluatorsEmptyStateViewProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col items-center px-8 pt-24 pb-8">
      <div className="mb-6 max-w-2xl text-center">
        <h2 className="mb-2 text-2xl font-bold">
          Turn traces into quality signals
        </h2>
        <p className="text-muted-foreground text-base">
          Score production traces and dataset runs with an LLM-as-a-judge, a
          decision model, or code.{" "}
          <a
            href={docsHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground whitespace-nowrap underline underline-offset-2"
          >
            How evaluators work.
          </a>
        </p>
      </div>

      <div className="flex w-full flex-col gap-8">
        <EvaluatorRecommendedCards label="Recommended starting points">
          {startingPoints.map((template) => (
            <EvaluatorRecommendedCard
              key={template.key}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </EvaluatorRecommendedCards>
        <button
          type="button"
          onClick={onBrowseLibrary}
          className="text-link hover:text-link-hover w-fit self-center text-base"
        >
          Browse all templates or start from scratch
        </button>
      </div>
    </div>
  );
}
