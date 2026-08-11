import { useRef, useState } from "react";
import type { EvalTemplateType } from "@langfuse/shared";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/src/components/ui/dialog";
import { EvaluatorGalleryView } from "@/src/features/evals/v2/components/EvaluatorGalleryView/EvaluatorGalleryView";
import type { GalleryTemplate } from "@/src/features/evals/v2/types/templateGallery";
import { prepareEvaluatorGallery } from "@/src/features/evals/v2/fns/templateGallery/prepareEvaluatorGallery";
import {
  EVALUATOR_GALLERY_EXPANDED_PROJECT_LIMIT,
  EVALUATOR_GALLERY_PREVIEW_SIZE,
  EVALUATOR_GALLERY_PROJECT_SECTION_KEY,
} from "@/src/features/evals/v2/constants/evaluatorGallery";
import { api } from "@/src/utils/api";

export function EvaluatorGalleryDialog({
  projectId,
  open,
  onOpenChange,
  onSelectTemplate,
  onCreateFromScratch,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectTemplate: (template: GalleryTemplate) => void;
  onCreateFromScratch: (type: EvalTemplateType) => void;
}) {
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const projectEvaluators = api.evalsV2.list.useQuery(
    {
      projectId,
      page: 1,
      limit: expandedSections.has(EVALUATOR_GALLERY_PROJECT_SECTION_KEY)
        ? EVALUATOR_GALLERY_EXPANDED_PROJECT_LIMIT
        : EVALUATOR_GALLERY_PREVIEW_SIZE,
      search: search.trim() || undefined,
    },
    { enabled: open && Boolean(projectId) },
  );
  const customTemplates = (projectEvaluators.data?.evaluators ?? []).flatMap(
    (evaluator) => {
      const latest = evaluator.versions[0];
      return latest
        ? [
            {
              id: evaluator.id,
              name: evaluator.name,
              type: evaluator.type,
              prompt: latest.prompt,
              sourceCodeLanguage: latest.sourceCodeLanguage,
              updatedAt: evaluator.updatedAt,
              version: latest.version,
              createdByUser: evaluator.createdByUser,
            },
          ]
        : [];
    },
  );
  const { navigationItems, sections } = prepareEvaluatorGallery({
    customTemplates,
    customTemplateCount:
      projectEvaluators.data?.totalItems ?? customTemplates.length,
    search,
  });
  const setSectionRef = (key: string) => (element: HTMLElement | null) => {
    if (element) sectionRefs.current.set(key, element);
    else sectionRefs.current.delete(key);
  };
  const scrollToSection = (key: string) => {
    if (key === navigationItems[0]?.key) {
      scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    sectionRefs.current
      .get(key)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    const atBottom =
      container.scrollTop + container.clientHeight >=
      container.scrollHeight - 4;
    let current = navigationItems[0]?.key ?? null;
    for (const item of navigationItems) {
      const element = sectionRefs.current.get(item.key);
      if (
        element &&
        (atBottom || element.getBoundingClientRect().top - containerTop <= 56)
      ) {
        current = item.key;
      }
    }
    setActiveSection(current);
  };
  const handleExpandedChange = (key: string, expanded: boolean) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (expanded) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[80dvh] w-[calc(100vw-2rem)] max-w-none flex-col gap-0 p-0 sm:w-[70vw]"
        closeOnInteractionOutside
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          searchInputRef.current?.focus();
        }}
      >
        <DialogHeader className="[&>div]:items-start [&>div>button]:-mt-1 [&>div>button]:-mr-2 [&>div>button]:flex [&>div>button]:size-8 [&>div>button]:items-center [&>div>button]:justify-center">
          <DialogTitle>Configure evaluator</DialogTitle>
          <DialogDescription>
            Choose a blank evaluator or start from an example.
          </DialogDescription>
        </DialogHeader>
        <EvaluatorGalleryView
          search={search}
          onSearchChange={setSearch}
          searchInputRef={searchInputRef}
          navigationItems={navigationItems}
          activeSection={activeSection}
          onSelectSection={scrollToSection}
          sections={sections}
          expandedSections={expandedSections}
          onExpandedChange={handleExpandedChange}
          onSelectTemplate={onSelectTemplate}
          onCreateFromScratch={onCreateFromScratch}
          sectionRef={setSectionRef}
          scrollContainerRef={scrollContainerRef}
          onScroll={handleScroll}
          isLoading={projectEvaluators.isPending}
          errorMessage={
            projectEvaluators.isError
              ? projectEvaluators.error.message
              : undefined
          }
        />
      </DialogContent>
    </Dialog>
  );
}
