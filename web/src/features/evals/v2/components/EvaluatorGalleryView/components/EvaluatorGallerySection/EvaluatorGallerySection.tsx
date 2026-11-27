import { ExpandToggle } from "@/src/components/design-system/ExpandToggle/ExpandToggle";

import { InfoTooltip } from "@/src/components/ui/InfoTooltip/InfoTooltip";
import { EvaluatorGallerySectionHeader } from "@/src/features/evals/v2/components/EvaluatorGallerySectionHeader/EvaluatorGallerySectionHeader";
import { EvaluatorRecommendedCard } from "@/src/features/evals/v2/components/EvaluatorRecommendedCard/EvaluatorRecommendedCard";
import { EvaluatorRecommendedCards } from "@/src/features/evals/v2/components/EvaluatorRecommendedCards/EvaluatorRecommendedCards";
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

type EvaluatorGallerySectionProps = {
  section: GallerySection;
  expanded: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate, sectionKey: string) => void;
};

type ManagedGalleryTemplate = Extract<GalleryTemplate, { source: "managed" }>;

export function EvaluatorGallerySection({
  section,
  expanded,
  onExpandedChange,
  onSelectTemplate,
}: EvaluatorGallerySectionProps) {
  const isRecommended =
    section.key === EVALUATOR_GALLERY_RECOMMENDED_SECTION_KEY;
  const selectTemplate = (template: GalleryTemplate) =>
    onSelectTemplate(template, section.key);
  const shownTemplates = expanded
    ? section.templates
    : section.templates.slice(0, EVALUATOR_GALLERY_PREVIEW_SIZE);
  // Only catalog templates carry preview scores; project templates stay rows.
  const shownManagedTemplates = shownTemplates.filter(
    (template): template is ManagedGalleryTemplate =>
      template.source === "managed",
  );
  const totalCount = section.totalCount ?? section.templates.length;
  const canToggle =
    totalCount > EVALUATOR_GALLERY_PREVIEW_SIZE && onExpandedChange;
  const handleToggleExpanded = () => onExpandedChange?.(!expanded);

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
        <GalleryCategoryBlock
          section={section}
          templates={shownTemplates}
          managedTemplates={shownManagedTemplates}
          onSelectTemplate={selectTemplate}
        />
      )}
      {canToggle ? (
        <GalleryShowAllToggle
          expanded={expanded}
          totalCount={totalCount}
          isProjectRows={section.key === EVALUATOR_GALLERY_PROJECT_SECTION_KEY}
          onToggle={handleToggleExpanded}
        />
      ) : null}
    </section>
  );
}

type GalleryShowAllToggleProps = {
  expanded: boolean;
  totalCount: number;
  isProjectRows: boolean;
  onToggle: () => void;
};

/** Text link under a section; under project rows it cancels the gap, since rows end in their own padding. */
function GalleryShowAllToggle({
  expanded,
  totalCount,
  isProjectRows,
  onToggle,
}: GalleryShowAllToggleProps) {
  return (
    <div className={isProjectRows ? "-mt-3" : undefined}>
      <ExpandToggle
        variant="underline"
        expanded={expanded}
        label={`Show all ${totalCount} templates`}
        expandedLabel="Show fewer"
        onExpandedChange={onToggle}
      />
    </div>
  );
}

type GalleryCategoryBlockProps = {
  section: GallerySection;
  templates: GalleryTemplate[];
  managedTemplates: ManagedGalleryTemplate[];
  onSelectTemplate: (template: GalleryTemplate) => void;
};

/** A non-recommended section: project templates as rows, catalog ones as cards. */
function GalleryCategoryBlock({
  section,
  templates,
  managedTemplates,
  onSelectTemplate,
}: GalleryCategoryBlockProps) {
  const isSafety = section.key === EVALUATOR_GALLERY_SAFETY_SECTION_KEY;
  const isProject = section.key === EVALUATOR_GALLERY_PROJECT_SECTION_KEY;

  return (
    <>
      <EvaluatorGallerySectionHeader label={section.label}>
        {isSafety ? (
          <InfoTooltip label={`About ${section.label}`}>
            {EVALUATOR_GALLERY_SAFETY_CALLOUT}
          </InfoTooltip>
        ) : null}
      </EvaluatorGallerySectionHeader>
      {isProject ? (
        <div className="flex flex-col">
          {templates.map((template) => (
            <EvaluatorTemplateRow
              key={getGalleryTemplateId(template)}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 @2xl:grid-cols-3">
          {managedTemplates.map((template) => (
            <EvaluatorRecommendedCard
              key={template.key}
              template={template}
              onSelect={onSelectTemplate}
            />
          ))}
        </div>
      )}
    </>
  );
}
