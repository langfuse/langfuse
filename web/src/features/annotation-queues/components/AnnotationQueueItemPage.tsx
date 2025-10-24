import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import {
  AnnotationQueueStatus,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { ArrowLeft, ArrowRight, SearchXIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Kbd } from "@/src/components/ui/kbd";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/src/components/ui/tooltip";
import { useAnnotationQueueData } from "./shared/hooks/useAnnotationQueueData";
import { useAnnotationObjectData } from "./shared/hooks/useAnnotationObjectData";
import { TraceAnnotationProcessor } from "./processors/TraceAnnotationProcessor";
import { SessionAnnotationProcessor } from "./processors/SessionAnnotationProcessor";
import { usePrefetchAdjacentItems } from "../hooks/usePrefetchAdjacentItems";

export const AnnotationQueueItemPage: React.FC<{
  annotationQueueId: string;
  projectId: string;
  view: "showTree" | "hideTree";
  queryItemId?: string;
}> = ({ annotationQueueId, projectId, view, queryItemId }) => {
  const router = useRouter();
  const showCompleted = router.query.showCompleted === "true";
  const [hasCommentDraft, setHasCommentDraft] = useState(false);

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  // 1. Fetch ordered list of item IDs (auto-refetches when showCompleted changes)
  const itemIds = api.annotationQueueItems.itemIdsByQueueId.useQuery(
    {
      queueId: annotationQueueId,
      projectId,
      includeCompleted: showCompleted,
    },
    { refetchOnWindowFocus: false },
  );

  // Prefetch adjacent items for faster navigation
  usePrefetchAdjacentItems({
    projectId,
    itemIds: itemIds.data,
    currentItemId: queryItemId,
    enabled: !!queryItemId && !itemIds.isPending,
  });

  // 2. Fetch current item data
  const currentItem = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: queryItemId as string },
    { enabled: !!queryItemId, refetchOnMount: false },
  );

  const { configs } = useAnnotationQueueData({ annotationQueueId, projectId });
  const objectData = useAnnotationObjectData(
    currentItem.data ?? null,
    projectId,
  );

  // 3. Navigation state
  const currentIndex = itemIds.data?.indexOf(queryItemId ?? "") ?? -1;
  const totalItems = itemIds.data?.length ?? 0;
  const canGoPrev = currentIndex > 0;
  const canGoNext = currentIndex >= 0 && currentIndex < totalItems - 1;

  // 4. Navigation helper
  const navigateToItem = useCallback(
    (itemId: string) => {
      const query: Record<string, string> = {};
      if (showCompleted) {
        query.showCompleted = "true";
      }

      router.push({
        pathname: `/project/${projectId}/annotation-queues/${annotationQueueId}/items/${itemId}`,
        query,
      });
    },
    [showCompleted, annotationQueueId, projectId, router],
  );

  // 5. Lock item when page loads (if it's pending and we have access)
  const lockItemMutation = api.annotationQueueItems.lockItem.useMutation();

  useEffect(() => {
    if (
      queryItemId &&
      hasAccess &&
      currentItem.data?.status === AnnotationQueueStatus.PENDING
    ) {
      lockItemMutation.mutate({ itemId: queryItemId, projectId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryItemId, currentItem.data?.status]);

  const handlePrev = useCallback(() => {
    if (hasCommentDraft) {
      const proceed = confirm(
        "You have an unsaved comment. Do you want to go to the previous item and discard this draft?",
      );
      if (!proceed) return;
    }

    if (canGoPrev && itemIds.data) {
      navigateToItem(itemIds.data[currentIndex - 1]);
    }
  }, [hasCommentDraft, canGoPrev, itemIds.data, currentIndex, navigateToItem]);

  const handleNext = useCallback(() => {
    if (hasCommentDraft) {
      const proceed = confirm(
        "You have an unsaved comment. Do you want to go to the next item and discard this draft?",
      );
      if (!proceed) return;
    }

    if (canGoNext && itemIds.data) {
      navigateToItem(itemIds.data[currentIndex + 1]);
    }
  }, [hasCommentDraft, canGoNext, itemIds.data, currentIndex, navigateToItem]);

  const utils = api.useUtils();
  const completeMutation = api.annotationQueueItems.complete.useMutation({
    onSuccess: () => {
      utils.annotationQueueItems.invalidate();
      showSuccessToast({
        title: "Item marked as complete",
        description: "The item is successfully marked as complete.",
      });

      // Auto-navigate to next if available
      if (canGoNext && itemIds.data) {
        navigateToItem(itemIds.data[currentIndex + 1]);
      }
    },
  });

  const handleComplete = async () => {
    if (!currentItem.data) return;

    const willNavigate = canGoNext;
    if (hasCommentDraft && willNavigate) {
      const proceed = confirm(
        "You have an unsaved comment. Do you want to complete and move to the next item, discarding the draft?",
      );
      if (!proceed) return;
    }

    await completeMutation.mutateAsync({
      itemId: currentItem.data.id,
      projectId,
    });
  };

  // 6. Keyboard shortcuts for navigation (k = previous, j = next)
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger keyboard shortcuts if the user is typing in an input
      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLElement &&
          event.target.getAttribute("role") === "textbox")
      ) {
        return;
      }
      // Don't trigger shortcuts if modifier keys are pressed (e.g., Cmd+K for universal search)
      if (event.metaKey || event.ctrlKey) {
        return;
      }

      if (event.key === "j" && canGoPrev) {
        handlePrev();
      } else if (event.key === "k" && canGoNext) {
        handleNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canGoPrev, canGoNext, handlePrev, handleNext]);

  // 7. Loading states
  if (itemIds.isPending || currentItem.isPending || objectData.isLoading) {
    return <Skeleton className="h-full w-full" />;
  }

  // 7. Render content
  const renderContent = () => {
    if (!currentItem.data) {
      return (
        <Card className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
          <SearchXIcon className="mb-2 h-8 w-8 text-muted-foreground" />
          <span className="max-w-96 text-wrap text-sm text-muted-foreground">
            Item has been <strong>deleted from annotation queue</strong>.
            Previously added scores and underlying reference trace are
            unaffected by this action.
          </span>
        </Card>
      );
    }

    switch (currentItem.data.objectType) {
      case AnnotationQueueObjectType.TRACE:
      case AnnotationQueueObjectType.OBSERVATION:
        return (
          <TraceAnnotationProcessor
            item={currentItem.data}
            data={objectData.data}
            view={view}
            configs={configs}
            projectId={projectId}
            onHasCommentDraftChange={setHasCommentDraft}
          />
        );
      case AnnotationQueueObjectType.SESSION:
        return (
          <SessionAnnotationProcessor
            item={currentItem.data}
            data={objectData.data}
            configs={configs}
            projectId={projectId}
            onHasCommentDraftChange={setHasCommentDraft}
          />
        );
      default:
        throw new Error(
          `Unsupported object type: ${currentItem.data.objectType}`,
        );
    }
  };

  // 8. Determine if we're in navigation mode (item is in the filtered list)
  const isInNavigationMode = currentIndex >= 0;

  return (
    <div className="grid h-full grid-rows-[1fr,auto] gap-4 overflow-hidden">
      {renderContent()}
      <div className="grid h-full w-full grid-cols-1 justify-end gap-2 sm:grid-cols-[auto,min-content]">
        {isInNavigationMode && (
          <div className="flex max-h-10 flex-row gap-2">
            <span className="grid h-9 min-w-16 items-center rounded-md bg-muted p-1 text-center text-sm">
              {currentIndex + 1} / {totalItems}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handlePrev}
                  variant="outline"
                  disabled={!canGoPrev || !hasAccess}
                  size="lg"
                  className="px-4"
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                  <Kbd className="ml-2">j</Kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Navigate to previous item</TooltipContent>
            </Tooltip>
          </div>
        )}
        <div className="flex w-full min-w-[265px] justify-end gap-2">
          {isInNavigationMode && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={handleNext}
                  disabled={!canGoNext || !hasAccess}
                  size="lg"
                  className={`px-4 ${!currentItem.data ? "w-full" : ""}`}
                  variant="outline"
                >
                  {currentItem.data?.status === AnnotationQueueStatus.PENDING
                    ? "Skip"
                    : "Next"}
                  <ArrowRight className="ml-1 h-4 w-4" />
                  <Kbd className="ml-2">k</Kbd>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Navigate to next item</TooltipContent>
            </Tooltip>
          )}
          {!!currentItem.data &&
            (currentItem.data.status === AnnotationQueueStatus.PENDING ? (
              <Button
                onClick={handleComplete}
                size="lg"
                className="w-full"
                disabled={completeMutation.isPending || !hasAccess}
              >
                {!isInNavigationMode || !canGoNext
                  ? "Complete"
                  : "Complete + Next"}
              </Button>
            ) : (
              <div className="text-dark-gree inline-flex h-9 w-full items-center justify-center rounded-md border border-dark-green bg-light-green px-8 text-sm font-medium">
                Completed
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
