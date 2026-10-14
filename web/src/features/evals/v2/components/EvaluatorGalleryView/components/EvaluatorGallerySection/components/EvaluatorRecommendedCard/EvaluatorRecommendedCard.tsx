import type { ReactNode } from "react";
import type { EvalTemplateType } from "@langfuse/shared";

import { EvaluatorGalleryMethodBadge } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryMethodBadge/EvaluatorGalleryMethodBadge";
import { EvaluatorGalleryScorePreview } from "@/src/features/evals/v2/components/EvaluatorGalleryView/components/EvaluatorGalleryScorePreview/EvaluatorGalleryScorePreview";
import { getGalleryTemplatePresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import type {
  GalleryTemplate,
  ManagedTemplate,
} from "@/src/features/evals/v2/types/templateGallery";

export function EvaluatorRecommendedCardSurface({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div className="group/card bg-background hover:shadow-card-hover relative flex h-full flex-col overflow-hidden rounded-lg border text-left">
      {children}
    </div>
  );
}

export function EvaluatorRecommendedCardContent({
  preview,
  footer,
  title,
  description,
}: {
  preview: ReactNode;
  footer: ReactNode;
  title: string;
  description: string | undefined;
}) {
  return (
    <>
      <div className="px-3 pt-3">{preview}</div>
      <div className="flex flex-1 flex-col px-3 pt-3 pb-3">
        <span className="line-clamp-2 text-xs font-bold" title={title}>
          {title}
        </span>
        <p
          className="text-muted-foreground mt-1 line-clamp-2 text-xs"
          title={description}
        >
          {description}
        </p>
      </div>
      <div className="flex items-center px-3 pb-3">{footer}</div>
    </>
  );
}

export function EvaluatorRecommendedTemplateCardContent({
  title,
  description,
  type,
  previewScores,
}: {
  title: string;
  description: string | undefined;
  type: EvalTemplateType;
  previewScores: ManagedTemplate["previewScores"];
}) {
  return (
    <EvaluatorRecommendedCardContent
      preview={
        <EvaluatorGalleryScorePreview scores={previewScores} type={type} />
      }
      footer={<EvaluatorGalleryMethodBadge type={type} />}
      title={title}
      description={description}
    />
  );
}

export function EvaluatorRecommendedCard({
  template,
  onSelect,
}: {
  template: Extract<GalleryTemplate, { source: "managed" }>;
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
        <EvaluatorRecommendedTemplateCardContent
          title={template.name}
          description={description}
          type={type}
          previewScores={template.previewScores}
        />
      </EvaluatorRecommendedCardSurface>
    </button>
  );
}
