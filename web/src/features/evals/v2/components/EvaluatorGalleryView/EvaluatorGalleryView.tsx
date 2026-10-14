/* eslint-disable no-nested-ternary */
import { useCallback, type RefObject } from "react";
import type { EvalTemplateType } from "@langfuse/shared";

import { Skeleton } from "@/src/components/ui/skeleton";
import { EvaluatorGalleryStartRow } from "./components/EvaluatorGalleryStartRow/EvaluatorGalleryStartRow";
import { EvaluatorGallerySection } from "./components/EvaluatorGallerySection/EvaluatorGallerySection";
import { EvaluatorGallerySidebar } from "./components/EvaluatorGallerySidebar/EvaluatorGallerySidebar";
import type {
  GalleryTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "../../types/templateGallery";
import {
  EVALUATOR_GALLERY_ALL_SECTION_KEY,
  EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
} from "../../constants/evaluatorGallery";
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
  navigationItems,
  activeSection,
  onSelectSection,
  sections,
  expandedSections,
  onExpandedChange,
  onSelectTemplate,
  onCreateFromScratch,
  scrollContainerRef,
  isLoading,
  hasMoreProjectTemplates = false,
  isLoadingMoreProjectTemplates = false,
  onLoadMoreProjectTemplates,
  errorMessage,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  navigationItems: GalleryNavigationItem[];
  activeSection: string | null;
  onSelectSection: (key: string) => void;
  sections: GallerySection[];
  expandedSections: ReadonlySet<string>;
  onExpandedChange: (key: string, expanded: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate, sectionKey: string) => void;
  onCreateFromScratch: (type: EvalTemplateType) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  hasMoreProjectTemplates?: boolean;
  isLoadingMoreProjectTemplates?: boolean;
  onLoadMoreProjectTemplates?: () => void;
  errorMessage?: string;
}) {
  const sidebarItems = gallerySidebarItems(navigationItems, sections);
  const resolvedSection =
    activeSection === EVALUATOR_GALLERY_ALL_SECTION_KEY ||
    sections.some((section) => section.key === activeSection)
      ? activeSection
      : EVALUATOR_GALLERY_ALL_SECTION_KEY;
  const displayedSections = visibleGallerySections(sections, resolvedSection);
  const hasTemplates = displayedSections.some(
    (section) => section.templates.length > 0,
  );
  const isSingleSection = resolvedSection !== EVALUATOR_GALLERY_ALL_SECTION_KEY;
  const selectSection = (key: string) => {
    if (key !== resolvedSection) onSearchChange("");
    onSelectSection(key);
  };
  const loadMoreSentinelRef = useCallback(
    (sentinel: HTMLDivElement | null) => {
      if (
        !sentinel ||
        !hasMoreProjectTemplates ||
        isLoadingMoreProjectTemplates ||
        !onLoadMoreProjectTemplates
      ) {
        return;
      }

      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer.disconnect();
            onLoadMoreProjectTemplates();
          }
        },
        { root: scrollContainerRef?.current, rootMargin: "200px 0px" },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [
      hasMoreProjectTemplates,
      isLoadingMoreProjectTemplates,
      onLoadMoreProjectTemplates,
      scrollContainerRef,
    ],
  );
  const shouldLoadMoreProjectTemplates =
    resolvedSection === EVALUATOR_GALLERY_PROJECT_SECTION_KEY &&
    (hasMoreProjectTemplates || isLoadingMoreProjectTemplates);

  return (
    <div className="@container flex flex-1 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden @2xl:flex-row">
        {sidebarItems.length > 0 ? (
          <EvaluatorGallerySidebar
            items={sidebarItems}
            activeSection={resolvedSection}
            onSelectSection={selectSection}
            search={search}
            onSearchChange={onSearchChange}
          />
        ) : (
          <div aria-hidden="true" className="w-56 shrink-0 border-r" />
        )}

        <div className="bg-surface-sunken @container flex min-w-0 flex-1 flex-col overflow-hidden">
          <div
            ref={scrollContainerRef}
            className="min-h-0 flex-1 overflow-y-auto"
          >
            <div className="flex flex-col gap-12 px-4 py-4">
              {!isSingleSection && (!search.trim() || !hasTemplates) ? (
                <EvaluatorGalleryStartRow
                  onCreateFromScratch={onCreateFromScratch}
                />
              ) : null}
              {isLoading ? <GallerySkeleton /> : null}
              {errorMessage ? (
                <div className="text-destructive py-8 text-center text-sm">
                  Error: {errorMessage}
                </div>
              ) : null}
              {!isLoading && !errorMessage ? (
                hasTemplates ? (
                  displayedSections.map((section) => (
                    <EvaluatorGallerySection
                      key={section.key}
                      section={section}
                      expanded={
                        isSingleSection || expandedSections.has(section.key)
                      }
                      onExpandedChange={
                        isSingleSection
                          ? undefined
                          : (expanded) => {
                              if (
                                expanded &&
                                section.key ===
                                  EVALUATOR_GALLERY_PROJECT_SECTION_KEY
                              ) {
                                selectSection(section.key);
                                return;
                              }
                              onExpandedChange(section.key, expanded);
                            }
                      }
                      onSelectTemplate={onSelectTemplate}
                    />
                  ))
                ) : (
                  <div className="text-muted-foreground py-8 text-center text-sm">
                    No templates match your search.
                  </div>
                )
              ) : null}
              {shouldLoadMoreProjectTemplates ? (
                <div
                  ref={
                    hasMoreProjectTemplates ? loadMoreSentinelRef : undefined
                  }
                  className="text-muted-foreground py-2 text-center text-sm"
                  role={isLoadingMoreProjectTemplates ? "status" : undefined}
                >
                  {isLoadingMoreProjectTemplates
                    ? "Loading more templates…"
                    : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
