import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

import { EvaluatorGalleryScorePreview } from "./components/EvaluatorGalleryScorePreview/EvaluatorGalleryScorePreview";
import styles from "./EvaluatorRecommendedCard.module.css";

type EvaluatorRecommendedCardProps = {
  template: Extract<GalleryTemplate, { source: "managed" }>;
  onSelect: (template: GalleryTemplate) => void;
};

export function EvaluatorRecommendedCard({
  template,
  onSelect,
}: EvaluatorRecommendedCardProps) {
  const { description, type } = getGalleryTemplatePresentation(template);
  const handleSelect = () => onSelect(template);

  return (
    <button
      type="button"
      onClick={handleSelect}
      className="h-full w-full cursor-pointer bg-transparent p-0 text-left"
    >
      <div
        className={cn(
          styles.card,
          "group/card bg-popover relative flex h-full flex-col overflow-hidden rounded-lg border text-left",
        )}
      >
        <div className="px-3 pt-3">
          <EvaluatorGalleryScorePreview
            scores={template.previewScores}
            type={type}
          />
        </div>
        <div className="flex flex-1 flex-col px-3 pt-3 pb-3">
          <span
            className="line-clamp-2 text-xs font-bold"
            title={template.name}
          >
            {template.name}
          </span>
          <p
            className="text-muted-foreground mt-1 line-clamp-2 text-xs"
            title={description}
          >
            {description}
          </p>
        </div>
        <div className="flex items-center px-3 pb-3">
          <EvaluatorGalleryMethodBadge type={type} />
        </div>
      </div>
    </button>
  );
}
