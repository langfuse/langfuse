import type { RefObject } from "react";
import { Code2, Search, Sparkles } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { getCategoryIconClasses } from "@/src/features/evals/v2/catalog-meta";
import { cn } from "@/src/utils/tailwind";
import { EvaluatorGallerySection } from "./EvaluatorGallerySection";
import type {
  EvaluatorTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "./types";

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(var(--spacing-evaluator-gallery-tile-min),1fr))] gap-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-25 rounded-lg" />
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
  onSelectTemplate: (template: EvaluatorTemplate) => void;
  onCreateFromScratch: (type: "llm" | "code") => void;
  sectionRef: (key: string) => (element: HTMLElement | null) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isLoading: boolean;
  errorMessage?: string;
}) {
  const hasExamples = sections.length > 0;

  return (
    <div className="flex flex-1 flex-row gap-4 overflow-hidden p-0">
      <div className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4">
        {navigationItems.length > 0 ? (
          <div className="flex h-8 shrink-0 items-center px-3 text-base font-bold">
            Examples
          </div>
        ) : null}
        {navigationItems.map((item) => {
          const isActive =
            (activeSection ?? navigationItems[0]?.key) === item.key;
          return (
            <Button
              key={item.key}
              type="button"
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "font-regular h-8 justify-start px-3",
                isActive
                  ? "hover:bg-secondary"
                  : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
              onClick={() => onSelectSection(item.key)}
            >
              {item.icon ? (
                <item.icon className="mr-2 h-4 w-4 shrink-0" />
              ) : null}
              <span className="truncate" title={item.label}>
                {item.label}
              </span>
              {item.count !== undefined ? (
                <Badge
                  variant="secondary"
                  size="sm"
                  className="text-muted-foreground font-regular ml-auto tabular-nums"
                >
                  {item.count}
                </Badge>
              ) : null}
            </Button>
          );
        })}
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden p-4 pb-0 pl-0">
        <div className="shrink-0 border-b pb-4">
          <div className="relative">
            <Search className="text-muted-foreground absolute top-1/2 left-2 h-4 w-4 -translate-y-1/2" />
            <Input
              ref={searchInputRef}
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search examples..."
              className="pl-8"
            />
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          onScroll={onScroll}
          className="flex flex-1 flex-col gap-8 overflow-y-auto py-4"
        >
          {isLoading ? <GallerySkeleton /> : null}
          {errorMessage ? (
            <div className="text-destructive py-8 text-center text-sm">
              Error: {errorMessage}
            </div>
          ) : null}
          {!isLoading && !errorMessage ? (
            <>
              {!search.trim() ? (
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xl leading-7 font-bold">
                    Start from scratch
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      className="hover:border-primary hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-4 text-left transition-all"
                      onClick={() => onCreateFromScratch("llm")}
                    >
                      <span
                        className={cn(
                          "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                          getCategoryIconClasses("rag"),
                        )}
                      >
                        <Sparkles className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">
                          LLM-as-a-judge
                        </span>
                        <span className="text-muted-foreground block text-sm">
                          Start with a blank prompt.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className="hover:border-primary hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-4 text-left transition-all"
                      onClick={() => onCreateFromScratch("code")}
                    >
                      <span className="bg-light-blue/40 text-dark-blue flex h-10 w-10 shrink-0 items-center justify-center rounded-lg">
                        <Code2 className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-bold">
                          Code evaluator
                        </span>
                        <span className="text-muted-foreground block text-sm">
                          Start with Python or TypeScript.
                        </span>
                      </span>
                    </button>
                  </div>
                </div>
              ) : null}

              {hasExamples ? (
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xl leading-7 font-bold">
                    Start from Examples
                  </h3>
                  <div className="flex flex-col gap-8">
                    {sections.map((section) => (
                      <EvaluatorGallerySection
                        key={section.key}
                        section={section}
                        expanded={expandedSections.has(section.key)}
                        onExpandedChange={(expanded) =>
                          onExpandedChange(section.key, expanded)
                        }
                        onSelectTemplate={onSelectTemplate}
                        sectionRef={sectionRef(section.key)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {!hasExamples ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No examples match your search.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
