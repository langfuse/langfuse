import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorRecommendedCard({
  template,
  categoryKey,
  onSelect,
}: {
  template: GalleryTemplate;
  categoryKey: string;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type } = getGalleryTemplatePresentation(template);
  const { edgeClassName } = getGalleryCategoryPresentation(categoryKey);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className={cn(
        "bg-background hover:bg-muted/40 flex min-h-28 cursor-pointer flex-col gap-2 rounded-lg border border-l-2 p-3 text-left transition-colors",
        edgeClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="truncate text-sm font-bold" title={template.name}>
          {template.name}
        </span>
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <p
        className="text-muted-foreground line-clamp-2 text-xs leading-relaxed"
        title={description}
      >
        {description}
      </p>
    </button>
  );
}
