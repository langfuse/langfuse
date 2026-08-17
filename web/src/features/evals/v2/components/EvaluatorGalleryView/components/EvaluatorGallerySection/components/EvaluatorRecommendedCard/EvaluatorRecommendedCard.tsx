import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorRecommendedCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const {
    description,
    type,
    icon: Icon,
  } = getGalleryTemplatePresentation(template);
  const { iconClassName } = getGalleryCategoryPresentation(
    EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="border-dark-yellow/30 bg-light-yellow hover:border-dark-yellow/60 flex min-h-44 cursor-pointer flex-col gap-3 rounded-xl border p-5 text-left shadow-xs transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-sm font-bold" title={template.name}>
          {template.name}
        </span>
        <p
          className="text-muted-foreground line-clamp-3 text-sm leading-relaxed"
          title={description}
        >
          {description}
        </p>
      </div>
    </button>
  );
}
