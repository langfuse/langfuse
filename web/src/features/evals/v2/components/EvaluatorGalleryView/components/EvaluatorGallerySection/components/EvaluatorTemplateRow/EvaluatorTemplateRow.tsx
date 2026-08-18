import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorTemplateRow({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type, attribution } =
    getGalleryTemplatePresentation(template);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="hover:bg-muted/60 flex cursor-pointer items-center gap-3 rounded-md px-1 py-2.5 text-left transition-colors"
    >
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
      <EvaluatorGalleryMethodBadge type={type} />
    </button>
  );
}
