import { useCallback } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { EvaluatorVersionHistoryList } from "./components/EvaluatorVersionHistoryList/EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistorySheet({
  open,
  onOpenChange,
  evaluatorName,
  versions,
  currentVersionId,
  defaultModel,
  expandedVersionId,
  onExpandedVersionChange,
  isLoading,
  hasMore,
  isLoadingMore,
  onLoadMore,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  evaluatorName: string;
  versions: EvaluatorVersion[];
  currentVersionId: string;
  defaultModel: JudgeModel | null;
  expandedVersionId: string | null;
  onExpandedVersionChange: (versionId: string | null) => void;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const loadMoreSentinelRef = useCallback(
    (sentinel: HTMLDivElement | null) => {
      if (!sentinel?.parentElement) return;

      const scrollContainer = sentinel.parentElement;
      const observer = new IntersectionObserver(
        ([entry]) => {
          if (entry?.isIntersecting) {
            observer.disconnect();
            onLoadMore();
          }
        },
        { root: scrollContainer, rootMargin: "200px 0px" },
      );
      observer.observe(sentinel);
      return () => observer.disconnect();
    },
    [onLoadMore],
  );

  const shouldObserveLoadMore = open && !isLoading && hasMore && !isLoadingMore;

  return (
    <Sheet open={open} modal={false} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Evaluator versions</SheetTitle>
          <SheetDescription>
            Saved definition versions for {evaluatorName}. Version history is
            read-only.
          </SheetDescription>
        </SheetHeader>
        <EvaluatorVersionHistoryList
          versions={versions}
          currentVersionId={currentVersionId}
          defaultModel={defaultModel}
          expandedVersionId={expandedVersionId}
          onExpandedVersionChange={onExpandedVersionChange}
          isLoading={isLoading}
        />
        {hasMore || isLoadingMore ? (
          <div
            ref={shouldObserveLoadMore ? loadMoreSentinelRef : undefined}
            className="flex h-8 shrink-0 items-center justify-center"
          >
            {isLoadingMore ? (
              <>
                <Spinner size="sm" variant="muted" />
                <span className="sr-only">Loading more versions</span>
              </>
            ) : null}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
