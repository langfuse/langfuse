import { ChevronDown, ChevronUp } from "lucide-react";

import { EvaluatorRecommendedCard } from "./components/EvaluatorRecommendedCard/EvaluatorRecommendedCard";
import { EvaluatorTemplateRow } from "./components/EvaluatorTemplateRow/EvaluatorTemplateRow";
import type {
  GalleryTemplate,
  GallerySection,
} from "@/src/features/evals/v2/types/templateGallery";
import {
  EVALUATOR_GALLERY_CATEGORY_DOT_CLASS,
  EVALUATOR_GALLERY_PREVIEW_SIZE,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryTemplateId } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";
import { cn } from "@/src/utils/tailwind";

export function EvaluatorGallerySection({
  section,
  expanded,
  onExpandedChange,
  onSelectTemplate,
  sectionRef,
}: {
  section: GallerySection;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
  sectionRef?: (element: HTMLElement | null) => void;
}) {
  const isRecommended =
    section.key === EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY;
  const shownTemplates = expanded
    ? section.templates
    : section.templates.slice(0, EVALUATOR_GALLERY_PREVIEW_SIZE);
  const totalCount = section.totalCount ?? section.templates.length;
  const dotClass = EVALUATOR_GALLERY_CATEGORY_DOT_CLASS[section.key];

  return (
    <section ref={sectionRef} className="flex scroll-mt-1 flex-col gap-2.5">
      <div className="flex items-center gap-2">
        {dotClass ? (
          <span className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)} />
        ) : null}
        <h4 className="text-muted-foreground text-xs font-bold tracking-wide uppercase">
          {section.label}
        </h4>
        <span className="text-muted-foreground ml-auto font-mono text-xs tabular-nums">
          {totalCount}
        </span>
      </div>
      {isRecommended ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {shownTemplates.map((template) => (
            <EvaluatorRecommendedCard
              key={getGalleryTemplateId(template)}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {shownTemplates.map((template) => (
            <EvaluatorTemplateRow
              key={getGalleryTemplateId(template)}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      )}
      {totalCount > EVALUATOR_GALLERY_PREVIEW_SIZE ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 text-sm"
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
