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
  const { description, type } = getGalleryTemplatePresentation(template);
  const { icon: Icon, iconClassName } = getGalleryCategoryPresentation(
    EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="bg-background hover:bg-muted/40 flex h-full cursor-pointer flex-col rounded-md border p-4 text-left transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <span
        className="mt-3 line-clamp-2 text-base font-bold"
        title={template.name}
      >
        {template.name}
      </span>
      <p
        className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed"
        title={description}
      >
        {description}
      </p>
    </button>
  );
}
