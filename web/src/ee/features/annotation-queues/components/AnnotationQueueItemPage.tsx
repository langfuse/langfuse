import { Trace } from "@/src/components/trace";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";
import { TracePreview } from "@/src/components/trace/TracePreview";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import useSessionStorage from "@/src/components/useSessionStorage";
import { CommentList } from "@/src/features/comments/CommentList";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  isPresent,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import {
  ArrowLeft,
  ArrowRight,
  SearchXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";
import { StringParam, useQueryParam } from "use-query-params";

const AnnotateIOView = ({
  item,
  configs,
  view,
}: {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  configs: ValidatedScoreConfig[];
  view: "showTree" | "hideTree";
}) => {
  const router = useRouter();
  const session = useSession();
  const traceId = item.parentTraceId ?? item.objectId;
  const projectId = router.query.projectId as string;
  const [showSaving, setShowSaving] = useState(false);
  const [showComments, setShowComments] = useSessionStorage(
    `annotationQueueShowComments-${projectId}`,
    false,
  );
  const [panelSize, setPanelSize] = useSessionStorage(
    `annotationQueuePanelSize-${projectId}`,
    65,
  );

  const [currentObservationId, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );
  useEffect(() => {
    if (
      view === "showTree" &&
      item.objectType === AnnotationQueueObjectType.OBSERVATION
    ) {
      setCurrentObservationId(item.objectId);
    } else setCurrentObservationId(undefined);
  }, [view, item, setCurrentObservationId]);

  const isLockedByOtherUser = item.lockedByUserId !== session.data?.user?.id;

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    { traceId, projectId },
    {
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
    },
  );

  const emptySelectedConfigIds = useMemo(() => {
    return configs.map((c) => c.id);
  }, [configs]);

  if (trace.isLoading || !trace.data)
    return <div className="p-3">Loading...</div>;

  let isValidObservationId = false;

  if (
    currentObservationId &&
    trace.data.observations.some(({ id }) => id === currentObservationId)
  ) {
    isValidObservationId = true;
  }

  return (
    <ResizablePanelGroup
      direction="horizontal"
      className="h-full overflow-hidden"
      onLayout={(sizes) => {
        setPanelSize(sizes[0]);
      }}
    >
      <ResizablePanel
        className="col-span-1 h-full !overflow-y-auto rounded-md border"
        minSize={30}
        defaultSize={panelSize}
      >
        {view === "hideTree" ? (
          <div className="max-h-full min-h-0 overflow-y-auto pl-4">
            {item.objectType === AnnotationQueueObjectType.TRACE ? (
              <TracePreview
                key={trace.data.id}
                trace={trace.data}
                scores={trace.data.scores}
                observations={trace.data.observations}
                viewType="focused"
              />
            ) : (
              <ObservationPreview
                observations={trace.data.observations}
                scores={trace.data.scores}
                projectId={item.projectId}
                currentObservationId={item.objectId}
                traceId={traceId}
                viewType="focused"
              />
            )}
          </div>
        ) : (
          <div className="max-h-full min-h-0 overflow-y-auto">
            <Trace
              key={trace.data.id}
              trace={trace.data}
              scores={trace.data.scores}
              projectId={trace.data.projectId}
              observations={trace.data.observations}
              viewType="focused"
              isValidObservationId={isValidObservationId}
            />
          </div>
        )}
      </ResizablePanel>
      <ResizableHandle withHandle className="ml-4 bg-transparent" />
      <ResizablePanel
        className="col-span-1 h-full md:flex md:flex-col md:overflow-hidden"
        minSize={30}
      >
        <Card className="col-span-2 flex h-full flex-col overflow-hidden">
          <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(auto,1fr),minmax(min-content,auto)] justify-between">
            <div className="w-full overflow-auto">
              <AnnotateDrawerContent
                key={"annotation-drawer-content" + item.objectId}
                scoreTarget={{
                  type: "trace",
                  traceId: traceId,
                  observationId: item.parentTraceId ? item.objectId : undefined,
                }}
                scores={trace.data?.scores ?? []}
                configs={configs}
                emptySelectedConfigIds={emptySelectedConfigIds}
                setEmptySelectedConfigIds={() => {}}
                projectId={item.projectId}
                analyticsData={{
                  type: "trace",
                  source: "AnnotationQueue",
                }}
                isSelectHidden
                queueId={item.queueId}
                showSaving={showSaving}
                setShowSaving={setShowSaving}
                environment={trace.data?.environment}
                actionButtons={
                  isLockedByOtherUser && isPresent(item.lockedByUser?.name) ? (
                    <div className="flex items-center justify-center rounded-sm border border-dark-red bg-light-red p-1">
                      <TriangleAlertIcon className="mr-1 h-4 w-4 text-dark-red" />
                      <span className="text-xs text-dark-red">
                        Currently edited by {item.lockedByUser.name}
                      </span>
                    </div>
                  ) : undefined
                }
                isDrawerOpen={true}
              />
            </div>
            <div className="relative max-h-64 overflow-auto">
              <Accordion
                type="single"
                collapsible
                className="mx-4 mt-4"
                value={showComments ? "item-1" : ""}
                onValueChange={(value) => setShowComments(value === "item-1")}
              >
                <AccordionItem value="item-1" className="border-none">
                  <div className="sticky top-0 z-10 border-b bg-background">
                    <AccordionTrigger
                      onClick={() => setShowComments(!showComments)}
                    >
                      Comments
                    </AccordionTrigger>
                  </div>
                  <AccordionContent>
                    <CommentList
                      projectId={item.projectId}
                      objectId={item.objectId}
                      objectType={item.objectType}
                      className="rounded-t-none border-t-transparent"
                      cardView
                    />
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </div>
          </div>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

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

  const queueData = api.annotationQueues.byId.useQuery(
    {
      queueId: annotationQueueId,
      projectId,
    },
    {
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
    },
  );

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

  const configs = queueData.data?.scoreConfigs ?? [];

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
    (seenItemData.isLoading && itemId) ||
    (fetchAndLockNextMutation.isLoading && !itemId) ||
    unseenPendingItemCount.isLoading
  ) {
    return <Skeleton className="h-full w-full" />;
  }

  if (!relevantItem && !(itemId && seenItemIds.includes(itemId))) {
    return <div>No more items left to annotate!</div>;
  }

  const isNextItemAvailable = totalItems > progressIndex + 1;

  return (
    <div className="grid h-full grid-rows-[1fr,auto] gap-4 overflow-hidden">
      {relevantItem ? (
        <AnnotateIOView item={relevantItem} configs={configs} view={view} />
      ) : (
        <Card className="flex h-full w-full flex-col items-center justify-center overflow-hidden">
          <SearchXIcon className="mb-2 h-8 w-8 text-muted-foreground" />
          <span className="max-w-96 text-wrap text-sm text-muted-foreground">
            Item has been <strong>deleted from annotation queue</strong>.
            Previously added scores and underlying reference trace are
            unaffected by this action.
          </span>
        </Card>
      )}
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
                  const nextItem = await fetchAndLockNextMutation.mutateAsync({
                    queueId: annotationQueueId,
                    projectId,
                    seenItemIds,
                  });
                  setNextItemData(nextItem);
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
    </div>
  );
};
