import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorTemplateRow({
  template,
  categoryKey,
  onSelect,
}: {
  template: GalleryTemplate;
  categoryKey: string;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type, returnTypeLabel, attribution } =
    getGalleryTemplatePresentation(template);
  const { icon: Icon, iconClassName } =
    getGalleryCategoryPresentation(categoryKey);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-1 py-2.5 text-left transition-colors"
    >
      <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
      <span
        className="max-w-[14rem] shrink-0 truncate text-sm font-bold"
        title={template.name}
      >
        {template.name}
      </span>
      <p
        className="text-muted-foreground min-w-0 flex-1 truncate text-sm"
        title={
          attribution ? `${description ?? ""} ${attribution}` : description
        }
      >
        {description}
        {attribution ? (
          <span className="text-muted-foreground/80"> · {attribution}</span>
        ) : null}
      </p>
      <div className="flex shrink-0 items-center gap-2">
        <EvaluatorGalleryMethodBadge type={type} />
        {returnTypeLabel ? (
          <span className="text-muted-foreground hidden min-w-20 text-right text-xs tracking-wide uppercase sm:inline">
            {returnTypeLabel}
          </span>
        ) : null}
      </div>
    </button>
  );
}
