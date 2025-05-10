import { Button } from "@/src/components/ui/button";
import { type QueueItemType } from "@/src/ee/features/annotation-queues/types";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { AnnotationQueueStatus } from "@langfuse/shared";
import { ArrowLeft, ArrowRight } from "lucide-react";

type AnnotationQueueItemFooterProps = {
  projectId: string;
  isSingleItem: boolean;
  progressIndex: number;
  setProgressIndex: (index: number) => void;
  totalItems: number;
  fetchAndLockNextItem: () => Promise<void>;
  seenItemIds: string[];
  relevantItem?: QueueItemType | null;
};

export const AnnotationQueueItemFooter = ({
  projectId,
  isSingleItem,
  progressIndex,
  setProgressIndex,
  totalItems,
  fetchAndLockNextItem,
  seenItemIds,
  relevantItem,
}: AnnotationQueueItemFooterProps) => {
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });
  const isNextItemAvailable = totalItems > progressIndex + 1;
  const utils = api.useUtils();

  const completeMutation = api.annotationQueueItems.complete.useMutation({
    onSuccess: async () => {
      utils.annotationQueueItems.invalidate();
      showSuccessToast({
        title: "Item marked as complete",
        description: "The item is successfully marked as complete.",
      });
      if (isSingleItem) {
        return;
      }

      if (progressIndex >= seenItemIds.length - 1) {
        await fetchAndLockNextItem();
      }

      if (progressIndex + 1 < totalItems) {
        setProgressIndex(Math.max(progressIndex + 1, 0));
      }
    },
  });

  return (
    <div className="grid h-full w-full grid-cols-1 justify-end gap-2 sm:grid-cols-[auto,min-content]">
      {!isSingleItem && (
        <div className="flex max-h-10 flex-row gap-2">
          <span className="grid h-9 min-w-16 items-center rounded-md bg-muted p-1 text-center text-sm">
            {progressIndex + 1} / {totalItems}
          </span>
          <Button
            onClick={() => {
              setProgressIndex(progressIndex - 1);
            }}
            variant="outline"
            disabled={progressIndex === 0 || !hasAccess}
            size="lg"
            className="px-4"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
      )}
      <div className="flex w-full min-w-[265px] justify-end gap-2">
        {!isSingleItem && (
          <Button
            onClick={async () => {
              if (progressIndex >= seenItemIds.length - 1) {
                fetchAndLockNextItem();
              }
              setProgressIndex(Math.max(progressIndex + 1, 0));
            }}
            disabled={!isNextItemAvailable || !hasAccess} // Disable button during loading
            size="lg"
            className={`px-4 ${!relevantItem ? "w-full" : ""}`}
            variant="outline"
          >
            {relevantItem?.status === AnnotationQueueStatus.PENDING
              ? "Skip"
              : "Next"}
            <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
        {!!relevantItem &&
          (relevantItem.status === AnnotationQueueStatus.PENDING ? (
            <Button
              onClick={async () => {
                await completeMutation.mutateAsync({
                  itemId: relevantItem.id,
                  projectId,
                });
              }}
              size="lg"
              className="w-full"
              disabled={completeMutation.isLoading || !hasAccess}
            >
              {isSingleItem || progressIndex + 1 === totalItems
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
  );
};
