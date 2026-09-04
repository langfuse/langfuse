import { useCallback, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/src/components/ui/sheet";
import type { JudgeModel } from "@/src/features/evals/v2/judgeModel";
import Spinner from "@/src/components/design-system/Spinner/Spinner";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EvaluatorVersionHistoryList } from "./components/EvaluatorVersionHistoryList/EvaluatorVersionHistoryList";
import type { EvaluatorVersion } from "./types";

export function EvaluatorVersionHistorySheet({
  open,
  onOpenChange,
  evaluatorName,
  versions,
  currentVersionId,
  defaultModel,
  defaultExpandedVersionId = null,
  onVersionExpansionChange,
  onRestoreVersion,
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
  defaultExpandedVersionId?: string | null;
  onVersionExpansionChange: (versionId: string | null) => void;
  onRestoreVersion: (version: EvaluatorVersion) => void;
  isLoading: boolean;
  hasMore: boolean;
  isLoadingMore: boolean;
  onLoadMore: () => void;
}) {
  const [versionToRestore, setVersionToRestore] =
    useState<EvaluatorVersion | null>(null);
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(
    defaultExpandedVersionId,
  );
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
    <Sheet
      open={open}
      modal={false}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && versionToRestore) return;
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent className="flex flex-col gap-5 overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Evaluator versions</SheetTitle>
          <SheetDescription>
            Review or restore saved definition versions for {evaluatorName}.
          </SheetDescription>
        </SheetHeader>
        <EvaluatorVersionHistoryList
          versions={versions}
          currentVersionId={currentVersionId}
          defaultModel={defaultModel}
          expandedVersionId={expandedVersionId}
          onExpandedVersionChange={(versionId) => {
            setExpandedVersionId(versionId);
            onVersionExpansionChange(versionId);
          }}
          onRestoreVersion={setVersionToRestore}
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
      <ConfirmDialog
        open={versionToRestore !== null}
        onOpenChange={(open) => {
          if (!open) setVersionToRestore(null);
        }}
        title={`Restore version ${versionToRestore?.version}?`}
        description={`This will replace the current evaluator definition with version ${versionToRestore?.version}. It won't be saved until you click "Save changes".`}
        confirmLabel="Restore version"
        confirmVariant="default"
        onConfirm={() => {
          if (!versionToRestore) return;
          onRestoreVersion(versionToRestore);
          setVersionToRestore(null);
          onOpenChange(false);
        }}
      />
    </Sheet>
  );
}
