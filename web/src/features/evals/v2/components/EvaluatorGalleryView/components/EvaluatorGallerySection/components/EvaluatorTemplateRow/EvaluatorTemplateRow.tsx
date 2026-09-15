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
      className="hover:bg-muted/60 @container block w-full cursor-pointer rounded-md px-1 py-2.5 text-left transition-colors"
    >
      <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 @3xl:grid-cols-[minmax(10rem,18rem)_minmax(0,1fr)_max-content_6rem]">
        <span
          className="col-start-1 row-start-1 min-w-0 truncate text-sm leading-5 font-bold"
          title={template.name}
        >
          {template.name}
        </span>
        <span
          className="text-muted-foreground col-span-2 col-start-1 row-start-2 min-w-0 truncate text-sm leading-5 @3xl:col-span-1 @3xl:col-start-2 @3xl:row-start-1"
          title={description}
        >
          {description}
        </span>
        {attribution ? (
          <span
            className="text-muted-foreground/80 col-span-2 col-start-1 row-start-3 min-w-0 text-xs leading-5 whitespace-normal @3xl:col-span-1 @3xl:col-start-3 @3xl:row-start-1 @3xl:text-sm @3xl:whitespace-nowrap"
            title={attribution}
          >
            {attribution}
          </span>
        ) : null}
        <span className="col-start-2 row-start-1 justify-self-end @3xl:col-start-4 @3xl:justify-self-start">
          <EvaluatorGalleryMethodBadge type={type} />
        </span>
      </span>
    </button>
  );
}
