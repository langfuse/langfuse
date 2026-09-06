import { ChevronDown, ChevronUp } from "lucide-react";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { EvaluatorRecommendedCard } from "./components/EvaluatorRecommendedCard/EvaluatorRecommendedCard";
import { EvaluatorRecommendedCards } from "./components/EvaluatorRecommendedCards/EvaluatorRecommendedCards";
import { EvaluatorTemplateRow } from "./components/EvaluatorTemplateRow/EvaluatorTemplateRow";
import type {
  GalleryTemplate,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";
import {
  EVALUATOR_GALLERY_PREVIEW_SIZE,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  EVALUATOR_GALLERY_SAFETY_CALLOUT,
  EVALUATOR_GALLERY_SAFETY_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryCategoryPresentation } from "@/src/features/evals/v2/fns/templateGallery/galleryCategoryPresentation";
import { getGalleryTemplateId } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorGallerySection({
  section,
  expanded,
  onExpandedChange,
  onSelectTemplate,
}: {
  section: GallerySection;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
}) {
  const isRecommended =
    section.key === EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY;
  const isSafety = section.key === EVALUATOR_GALLERY_SAFETY_SECTION_KEY;
  const shownTemplates = expanded
    ? section.templates
    : section.templates.slice(0, EVALUATOR_GALLERY_PREVIEW_SIZE);
  const totalCount = section.totalCount ?? section.templates.length;
  const { icon: Icon, iconClassName } = getGalleryCategoryPresentation(
    section.key,
  );

  return (
    <section className="flex scroll-mt-1 flex-col gap-3">
      {isRecommended ? (
        <EvaluatorRecommendedCards label={section.label}>
          {shownTemplates.map((template) => (
            <EvaluatorRecommendedCard
              key={getGalleryTemplateId(template)}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </EvaluatorRecommendedCards>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <Icon className={cn("h-3.5 w-3.5 shrink-0", iconClassName)} />
              <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
                {section.label}
              </h4>
              {isSafety ? (
                <InfoTooltip label={`About ${section.label}`}>
                  {EVALUATOR_GALLERY_SAFETY_CALLOUT}
                </InfoTooltip>
              ) : null}
            </div>
            <div className="border-t" />
          </div>
          <div className="flex flex-col">
            {shownTemplates.map((template) => (
              <EvaluatorTemplateRow
                key={getGalleryTemplateId(template)}
                template={template}
                onSelect={onSelectTemplate}
              />
            ))}
          </div>
        </>
      )}
      {totalCount > EVALUATOR_GALLERY_PREVIEW_SIZE && onExpandedChange ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 px-1 text-sm"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          )}
          {expanded ? "Show fewer" : `Show all ${totalCount} templates`}
        </button>
      ) : null}
    </section>
  );
}
