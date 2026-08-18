import type { ReactNode } from "react";
import type { EvalTemplateType } from "@langfuse/shared";

import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorRecommendedCardSurface({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="bg-background hover:bg-muted/40 relative flex h-full flex-col rounded-md border p-4 text-left transition-colors">
      {children}
    </div>
  );
}

export function EvaluatorRecommendedCardContent({
  title,
  description,
  type,
}: {
  title: string;
  description: string | undefined;
  type: EvalTemplateType;
}) {
  const { icon: Icon, iconClassName } = getGalleryCategoryPresentation(
    EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  );

  return (
    <>
      <div className="flex items-start justify-between gap-2">
        <Icon className={cn("h-4 w-4 shrink-0", iconClassName)} />
        <EvaluatorGalleryMethodBadge type={type} />
      </div>
      <span className="mt-3 line-clamp-2 text-base font-bold" title={title}>
        {title}
      </span>
      <p
        className="text-muted-foreground mt-1 line-clamp-2 text-sm leading-relaxed"
        title={description}
      >
        {description}
      </p>
    </>
  );
}

export function EvaluatorRecommendedCard({
  template,
  onSelect,
}: {
  template: GalleryTemplate;
  onSelect: (template: GalleryTemplate) => void;
}) {
  const { description, type } = getGalleryTemplatePresentation(template);

  return (
    <button
      type="button"
      onClick={() => onSelect(template)}
      className="h-full w-full cursor-pointer bg-transparent p-0 text-left"
    >
      <EvaluatorRecommendedCardSurface>
        <EvaluatorRecommendedCardContent
          title={template.name}
          description={description}
          type={type}
        />
      </EvaluatorRecommendedCardSurface>
    </button>
  );
}
