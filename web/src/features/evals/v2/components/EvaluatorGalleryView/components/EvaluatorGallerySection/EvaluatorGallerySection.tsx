import { ChevronDown, ChevronUp } from "lucide-react";
import { EvaluatorTemplateCard } from "./components/EvaluatorTemplateCard/EvaluatorTemplateCard";
import {
  galleryTemplateKey,
  type GalleryTemplate,
  type GallerySection,
} from "../../types";

const MAX_TILES_PER_SECTION = 6;

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
  const shownTemplates = expanded
    ? section.templates
    : section.templates.slice(0, MAX_TILES_PER_SECTION);
  // Sections hold one source at a time: the project's own evaluators or
  // managed examples.
  const noun =
    section.templates[0]?.source === "custom" ? "evaluators" : "examples";

  return (
    <section ref={sectionRef} className="flex scroll-mt-1 flex-col gap-2.5">
      <div>
        <h4 className="text-base leading-6 font-bold">{section.label}</h4>
        <p className="text-muted-foreground text-sm leading-relaxed">
          {section.description}
        </p>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(--spacing(64),1fr))] gap-3">
        {shownTemplates.map((template) => (
          <EvaluatorTemplateCard
            key={galleryTemplateKey(template)}
            template={template}
            onSelect={onSelectTemplate}
          />
        ))}
      </div>
      {section.templates.length > MAX_TILES_PER_SECTION ? (
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
          {expanded
            ? "Show fewer"
            : `Show all ${section.templates.length} ${noun}`}
        </button>
      ) : null}
    </section>
  );
}
