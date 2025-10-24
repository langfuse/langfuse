import { Card } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  AnnotationQueueStatus,
  AnnotationQueueObjectType,
} from "@langfuse/shared";
import { ArrowLeft, ArrowRight, SearchXIcon } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import { useAnnotationQueueData } from "./shared/hooks/useAnnotationQueueData";
import { useAnnotationObjectData } from "./shared/hooks/useAnnotationObjectData";
import { TraceAnnotationProcessor } from "./processors/TraceAnnotationProcessor";
import { SessionAnnotationProcessor } from "./processors/SessionAnnotationProcessor";

export const AnnotationQueueItemPage: React.FC<{
  annotationQueueId: string;
  projectId: string;
  view: "showTree" | "hideTree";
  queryItemId?: string;
}> = ({ annotationQueueId, projectId, view, queryItemId }) => {
  const router = useRouter();
  const isSingleItem = router.query.singleItem === "true";
  const [nextItemData, setNextItemData] = useState<
    RouterOutput["annotationQueues"]["fetchAndLockNext"] | null
  >(null);
  const [seenItemIds, setSeenItemIds] = useState<string[]>([]);
  const [progressIndex, setProgressIndex] = useState(0);

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  const itemId = isSingleItem ? queryItemId : seenItemIds[progressIndex];

  const seenItemData = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: itemId as string },
    { enabled: !!itemId, refetchOnMount: false },
  );

  const fetchAndLockNextMutation =
    api.annotationQueues.fetchAndLockNext.useMutation();

  // Effects
  useEffect(() => {
    async function fetchNextItem() {
      if (!itemId && !isSingleItem) {
        const nextItem = await fetchAndLockNextMutation.mutateAsync({
          queueId: annotationQueueId,
          projectId,
          seenItemIds,
        });
        setNextItemData(nextItem);
      }
    }
    fetchNextItem();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { configs } = useAnnotationQueueData({ annotationQueueId, projectId });

  const unseenPendingItemCount =
    api.annotationQueueItems.unseenPendingItemCountByQueueId.useQuery(
      {
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      },
      { refetchOnWindowFocus: false },
    );

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
        const nextItem = await fetchAndLockNextMutation.mutateAsync({
          queueId: annotationQueueId,
          projectId,
          seenItemIds,
        });
        setNextItemData(nextItem);
      }

      if (progressIndex + 1 < totalItems) {
        setProgressIndex(Math.max(progressIndex + 1, 0));
      }
    },
  });

  const totalItems = useMemo(() => {
    return seenItemIds.length + (unseenPendingItemCount.data ?? 0);
  }, [unseenPendingItemCount.data, seenItemIds.length]);

  const relevantItem = useMemo(() => {
    if (isSingleItem) return seenItemData.data;
    else
      return progressIndex < seenItemIds.length
        ? seenItemData.data
        : nextItemData;
  }, [
    progressIndex,
    seenItemIds.length,
    seenItemData.data,
    nextItemData,
    isSingleItem,
  ]);

  const objectData = useAnnotationObjectData(relevantItem ?? null, projectId);

  useEffect(() => {
    if (relevantItem && router.query.itemId !== relevantItem.id) {
      router.push(
        {
          pathname: `/project/${projectId}/annotation-queues/${annotationQueueId}/items/${relevantItem.id}`,
        },
        undefined,
      );
    }
  }, [relevantItem, router, projectId, annotationQueueId]);

  useEffect(() => {
    if (
      relevantItem &&
      !seenItemIds.includes(relevantItem.id) &&
      !isSingleItem
    ) {
      setSeenItemIds((prev) => [...prev, relevantItem.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantItem]);

  if (
    (seenItemData.isPending && itemId) ||
    (fetchAndLockNextMutation.isPending && !itemId) ||
    unseenPendingItemCount.isPending ||
    objectData.isLoading
  ) {
    return <Skeleton className="h-full w-full" />;
  }

  if (!relevantItem && !(itemId && seenItemIds.includes(itemId))) {
    return <div>No more items left to annotate!</div>;
  }

  const isNextItemAvailable = totalItems > progressIndex + 1;

  const handleNavigateBack = () => {
    setProgressIndex(progressIndex - 1);
  };

  const handleNavigateNext = async () => {
    if (progressIndex >= seenItemIds.length - 1) {
      const nextItem = await fetchAndLockNextMutation.mutateAsync({
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      });
      setNextItemData(nextItem);
    }
    setProgressIndex(Math.max(progressIndex + 1, 0));
  };

  const handleComplete = async () => {
    if (!relevantItem) return;
    await completeMutation.mutateAsync({
      itemId: relevantItem.id,
      projectId,
    });
  };

  const renderContent = () => {
    if (!relevantItem) {
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

    switch (relevantItem.objectType) {
      case AnnotationQueueObjectType.TRACE:
      case AnnotationQueueObjectType.OBSERVATION:
        return (
          <TraceAnnotationProcessor
            item={relevantItem}
            data={objectData.data}
            view={view}
            configs={configs}
            projectId={projectId}
          />
        );
      case AnnotationQueueObjectType.SESSION:
        return (
          <SessionAnnotationProcessor
            item={relevantItem}
            data={objectData.data}
            configs={configs}
            projectId={projectId}
          />
        );
      default:
        throw new Error(`Unsupported object type: ${relevantItem.objectType}`);
    }
  };

  return (
    <div className="grid h-full grid-rows-[1fr,auto] gap-4 overflow-hidden">
      {renderContent()}
      <div className="grid h-full w-full grid-cols-1 justify-end gap-2 sm:grid-cols-[auto,min-content]">
        {!isSingleItem && (
          <div className="flex max-h-10 flex-row gap-2">
            <span className="grid h-9 min-w-16 items-center rounded-md bg-muted p-1 text-center text-sm">
              {progressIndex + 1} / {totalItems}
            </span>
            <Button
              onClick={handleNavigateBack}
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
              onClick={handleNavigateNext}
              disabled={!isNextItemAvailable || !hasAccess}
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
                onClick={handleComplete}
                size="lg"
                className="w-full"
                disabled={completeMutation.isPending || !hasAccess}
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
    </div>
  );
};
