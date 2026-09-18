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
import { EVALUATOR_GALLERY_ALL_SECTION_KEY } from "@/src/features/evals/v2/constants/evaluatorGallery";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import { getEvaluatorCreationAnalyticsProperties } from "@/src/features/evals/v2/fns/evaluators/getEvaluatorCreationAnalyticsProperties";
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
  const capture = usePostHogClientCapture();
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<string>(
    EVALUATOR_GALLERY_ALL_SECTION_KEY,
  );
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(),
  );
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const projectEvaluators = api.evalsV2.listGallery.useInfiniteQuery(
    {
      projectId,
      limit: 50,
      search: search.trim() || undefined,
    },
    {
      enabled: open && Boolean(projectId),
      getNextPageParam: (lastPage) => lastPage.nextCursor,
      placeholderData: (previous) => previous,
    },
  );
  const customTemplates = (
    projectEvaluators.data?.pages.flatMap((page) => page.evaluators) ?? []
  ).flatMap((evaluator) => {
    const latest = evaluator.versions[0];
    return latest
      ? [
          {
            id: evaluator.id,
            name: evaluator.name,
            description: evaluator.description,
            type: evaluator.type,
            sourceCodeLanguage: latest.sourceCodeLanguage,
            updatedAt: evaluator.updatedAt,
            version: latest.version,
            createdByUser: evaluator.createdByUser,
          },
        ]
      : [];
  });
  const { navigationItems, sections } = prepareEvaluatorGallery({
    customTemplates,
    customTemplateCount:
      projectEvaluators.data?.pages[0]?.totalItems ?? customTemplates.length,
    search,
  });
  const selectSection = (key: string) => {
    setActiveSection(key);
    scrollContainerRef.current?.scrollTo({ top: 0 });
  };
  const handleExpandedChange = (key: string, expanded: boolean) => {
    setExpandedSections((current) => {
      const next = new Set(current);
      if (expanded) next.add(key);
      else next.delete(key);
      return next;
    });
  };
  const handleSelectTemplate = (template: GalleryTemplate) => {
    const evaluatorType =
      template.source === "managed" ? template.evaluator.type : template.type;
    const creationSource =
      template.source === "managed"
        ? { type: "managed" as const, templateKey: template.key }
        : { type: "custom" as const };
    capture(
      "evaluators:gallery_creation_source_select",
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType,
        creationSource,
      }),
    );
    onSelectTemplate(template);
  };
  const handleCreateFromScratch = (evaluatorType: EvalTemplateType) => {
    capture(
      "evaluators:gallery_creation_source_select",
      getEvaluatorCreationAnalyticsProperties({
        evaluatorType,
        creationSource: { type: "scratch" },
      }),
    );
    onCreateFromScratch(evaluatorType);
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
          <DialogTitle>Add an evaluator</DialogTitle>
          <DialogDescription>
            Pick a template to start from or create a new evaluator from
            scratch.
          </DialogDescription>
        </DialogHeader>
        <EvaluatorGalleryView
          search={search}
          onSearchChange={setSearch}
          searchInputRef={searchInputRef}
          navigationItems={navigationItems}
          activeSection={activeSection}
          onSelectSection={selectSection}
          sections={sections}
          expandedSections={expandedSections}
          onExpandedChange={handleExpandedChange}
          onSelectTemplate={handleSelectTemplate}
          onCreateFromScratch={handleCreateFromScratch}
          scrollContainerRef={scrollContainerRef}
          isLoading={projectEvaluators.isPending}
          hasMoreProjectTemplates={projectEvaluators.hasNextPage}
          isLoadingMoreProjectTemplates={projectEvaluators.isFetchingNextPage}
          onLoadMoreProjectTemplates={projectEvaluators.fetchNextPage}
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
