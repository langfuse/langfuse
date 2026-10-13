import { DropdownIndicator } from "@/src/components/design-system/DropdownIndicator/DropdownIndicator";

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
  EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
  EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY,
  EVALUATOR_GALLERY_SAFETY_CALLOUT,
  EVALUATOR_GALLERY_SAFETY_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";
import { getGalleryTemplateId } from "@/src/features/evals/v2/fns/templateGallery/galleryTemplatePresentation";

export function EvaluatorGallerySection({
  section,
  expanded,
  onExpandedChange,
  onSelectTemplate,
}: {
  section: GallerySection;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate, sectionKey: string) => void;
}) {
  const isRecommended =
    section.key === EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY;
  const isSafety = section.key === EVALUATOR_GALLERY_SAFETY_SECTION_KEY;
  const isProject = section.key === EVALUATOR_GALLERY_PROJECT_SECTION_KEY;
  const selectTemplate = (template: GalleryTemplate) =>
    onSelectTemplate(template, section.key);
  const shownTemplates = expanded
    ? section.templates
    : section.templates.slice(0, EVALUATOR_GALLERY_PREVIEW_SIZE);
  // Only catalog templates carry preview scores; project templates stay rows.
  const shownManagedTemplates = shownTemplates.filter(
    (template): template is Extract<GalleryTemplate, { source: "managed" }> =>
      template.source === "managed",
  );
  const totalCount = section.totalCount ?? section.templates.length;

  return (
    <section className="flex scroll-mt-1 flex-col gap-3">
      {isRecommended ? (
        <EvaluatorRecommendedCards label={section.label}>
          {shownManagedTemplates.map((template) => (
            <EvaluatorRecommendedCard
              key={template.key}
              template={template}
              onSelect={selectTemplate}
            />
          ))}
        </EvaluatorRecommendedCards>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h4 className="text-foreground text-sm font-bold">
                {section.label}
              </h4>
              {isSafety ? (
                <InfoTooltip label={`About ${section.label}`}>
                  {EVALUATOR_GALLERY_SAFETY_CALLOUT}
                </InfoTooltip>
              ) : null}
            </div>
          </div>
          {isProject ? (
            <div className="bg-background flex flex-col overflow-hidden rounded-md border">
              {shownTemplates.map((template) => (
                <EvaluatorTemplateRow
                  key={getGalleryTemplateId(template)}
                  template={template}
                  onSelect={selectTemplate}
                />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
              {shownManagedTemplates.map((template) => (
                <EvaluatorRecommendedCard
                  key={template.key}
                  template={template}
                  onSelect={selectTemplate}
                />
              ))}
            </div>
          )}
        </>
      )}
      {totalCount > EVALUATOR_GALLERY_PREVIEW_SIZE && onExpandedChange ? (
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1.5 px-1 text-sm"
          onClick={() => onExpandedChange(!expanded)}
        >
          {expanded ? (
            <DropdownIndicator direction="up" nudge />
          ) : (
            <DropdownIndicator nudge />
          )}
          {expanded ? "Show fewer" : `Show all ${totalCount} templates`}
        </button>
      ) : null}
    </section>
  );
}
