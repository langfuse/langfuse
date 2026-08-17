import type { RefObject } from "react";
import { Code2, Search, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";

import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EvaluatorGallerySection } from "./components/EvaluatorGallerySection/EvaluatorGallerySection";
import { EvaluatorGallerySidebar } from "./components/EvaluatorGallerySidebar/EvaluatorGallerySidebar";
import type {
  GalleryTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "../../types/templateGallery";
import { EVALUATOR_GALLERY_ALL_SECTION_KEY } from "../../constants/evaluatorGallery";
import {
  gallerySidebarItems,
  visibleGallerySections,
} from "../../fns/templateGallery/visibleGallerySections";

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Skeleton className="h-5 w-32" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-10 rounded-md" />
        ))}
      </div>
    </div>
  );
}

export function EvaluatorGalleryView({
  search,
  onSearchChange,
  searchInputRef,
  navigationItems,
  activeSection,
  onSelectSection,
  sections,
  expandedSections,
  onExpandedChange,
  onSelectTemplate,
  onCreateFromScratch,
  sectionRef,
  scrollContainerRef,
  onScroll,
  isLoading,
  errorMessage,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  searchInputRef?: RefObject<HTMLInputElement | null>;
  navigationItems: GalleryNavigationItem[];
  activeSection: string | null;
  onSelectSection: (key: string) => void;
  sections: GallerySection[];
  expandedSections: ReadonlySet<string>;
  onExpandedChange: (key: string, expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
  onCreateFromScratch: (type: EvalTemplateType) => void;
  sectionRef?: (key: string) => (element: HTMLElement | null) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll?: () => void;
  isLoading: boolean;
  errorMessage?: string;
}) {
  const sidebarItems = gallerySidebarItems(navigationItems, sections);
  const resolvedSection = sidebarItems.some(
    (item) => item.key === activeSection,
  )
    ? activeSection
    : EVALUATOR_GALLERY_ALL_SECTION_KEY;
  const displayedSections = visibleGallerySections(sections, resolvedSection);
  const hasTemplates = displayedSections.length > 0;

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-b px-4 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => onCreateFromScratch(EvalTemplateTypeEnum.LLM_AS_JUDGE)}
        >
          <Sparkles className="mr-1.5 h-3.5 w-3.5" />
          Blank LLM-as-a-judge
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onCreateFromScratch(EvalTemplateTypeEnum.CODE)}
        >
          <Code2 className="mr-1.5 h-3.5 w-3.5" />
          Blank code evaluator
        </Button>
      </div>
      <div className="flex min-h-0 flex-1 flex-row overflow-hidden">
        {sidebarItems.length > 0 ? (
          <EvaluatorGallerySidebar
            items={sidebarItems}
            activeSection={resolvedSection}
            onSelectSection={onSelectSection}
          />
        ) : null}

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 pb-0">
          <div className="relative shrink-0 border-b pb-4">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search what you want to measure."
              className="pl-8"
            />
          </div>

          <div
            ref={scrollContainerRef}
            onScroll={onScroll}
            className="flex flex-1 flex-col gap-10 overflow-y-auto py-4"
          >
            {isLoading ? <GallerySkeleton /> : null}
            {errorMessage ? (
              <div className="text-destructive py-8 text-center text-sm">
                Error: {errorMessage}
              </div>
            ) : null}
            {!isLoading && !errorMessage ? (
              hasTemplates ? (
                <div className="flex flex-col gap-10">
                  {displayedSections.map((section) => (
                    <EvaluatorGallerySection
                      key={section.key}
                      section={section}
                      expanded={expandedSections.has(section.key)}
                      onExpandedChange={(expanded) =>
                        onExpandedChange(section.key, expanded)
                      }
                      onSelectTemplate={onSelectTemplate}
                      sectionRef={sectionRef?.(section.key)}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No templates match your search.
                </div>
              )
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
