import type { RefObject } from "react";
import { Code2, Search, Sparkles } from "lucide-react";
import { EvalTemplateTypeEnum, type EvalTemplateType } from "@langfuse/shared";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { cn } from "@/src/utils/tailwind";
import { EvaluatorGallerySection } from "./components/EvaluatorGallerySection/EvaluatorGallerySection";
import type {
  GalleryTemplate,
  GalleryNavigationItem,
  GallerySection,
} from "../../types/templateGallery";

const FROM_SCRATCH_OPTIONS = [
  {
    type: EvalTemplateTypeEnum.LLM_AS_JUDGE,
    label: "LLM-as-a-judge",
    description: "Start with a blank prompt.",
    icon: Sparkles,
    iconClasses: "bg-light-violet text-dark-violet",
  },
  {
    type: EvalTemplateTypeEnum.CODE,
    label: "Code evaluator",
    description: "Start with Python or TypeScript.",
    icon: Code2,
    iconClasses: "bg-light-blue/40 text-dark-blue",
  },
] as const;

function GallerySkeleton() {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <Skeleton className="h-5 w-32" />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 2xl:grid-cols-3">
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
  onSelectTemplate: (template: GalleryTemplate) => void;
  onCreateFromScratch: (type: EvalTemplateType) => void;
  sectionRef: (key: string) => (element: HTMLElement | null) => void;
  scrollContainerRef?: RefObject<HTMLDivElement | null>;
  onScroll: () => void;
  isLoading: boolean;
  errorMessage?: string;
}) {
  const hasTemplates = sections.length > 0;

  return (
    <div className="flex flex-1 flex-row gap-4 overflow-hidden p-0">
      <div className="flex w-56 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-4">
        {navigationItems.length > 0 ? (
          <div className="flex h-8 shrink-0 items-center px-3 text-base font-bold">
            Templates
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
                  className="text-muted-foreground font-regular ml-auto font-mono tabular-nums"
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
              placeholder="Search templates..."
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
                    {FROM_SCRATCH_OPTIONS.map((option) => (
                      <button
                        key={option.type}
                        type="button"
                        className="hover:border-primary hover:bg-accent/40 flex items-center gap-3 rounded-lg border p-4 text-left transition-all"
                        onClick={() => onCreateFromScratch(option.type)}
                      >
                        <span
                          className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                            option.iconClasses,
                          )}
                        >
                          <option.icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-bold">
                            {option.label}
                          </span>
                          <span className="text-muted-foreground block text-sm">
                            {option.description}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {hasTemplates ? (
                <div className="flex flex-col gap-2.5">
                  <h3 className="text-xl leading-7 font-bold">
                    Start from Templates
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

              {!hasTemplates ? (
                <div className="text-muted-foreground py-8 text-center text-sm">
                  No templates match your search.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
