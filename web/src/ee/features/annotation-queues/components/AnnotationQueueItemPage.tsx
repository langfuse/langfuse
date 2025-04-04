import { ErrorPage } from "@/src/components/error-page";
import { Trace } from "@/src/components/trace";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";
import { TracePreview } from "@/src/components/trace/TracePreview";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/src/components/ui/accordion";
import { Card } from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import useSessionStorage from "@/src/components/useSessionStorage";
import { AnnotationQueueItemFooter } from "@/src/ee/features/annotation-queues/components/AnnotationQueueItemFooter";
import { type QueueItemType } from "@/src/ee/features/annotation-queues/types";
import { CommentList } from "@/src/features/comments/CommentList";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { api } from "@/src/utils/api";
import { type RouterOutput } from "@/src/utils/types";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  isPresent,
  LangfuseNotFoundError,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import { SearchXIcon, TriangleAlertIcon } from "lucide-react";
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
                traceId={traceId}
                scores={trace.data?.scores ?? []}
                observationId={item.parentTraceId ? item.objectId : undefined}
                configs={configs}
                emptySelectedConfigIds={emptySelectedConfigIds}
                setEmptySelectedConfigIds={() => {}}
                projectId={item.projectId}
                type={item.objectType.toLowerCase() as "trace" | "observation"}
                isSelectHidden
                queueId={item.queueId}
                showSaving={showSaving}
                setShowSaving={setShowSaving}
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
  const [referencedItemNotFound, setReferencedItemNotFound] = useState(false);

  const itemId = isSingleItem ? queryItemId : seenItemIds[progressIndex];

  const seenItemData = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: itemId as string },
    {
      retry(failureCount, error) {
        if (
          error.data?.code === "UNAUTHORIZED" ||
          error.data?.code === "NOT_FOUND"
        )
          return false;
        return failureCount < 3;
      },
      enabled: !!itemId,
      refetchOnMount: false,
    },
  );

  const fetchAndLockNextMutation =
    api.annotationQueues.fetchAndLockNext.useMutation();

  const fetchAndLockNextItem = async () => {
    try {
      const nextItem = await fetchAndLockNextMutation.mutateAsync({
        queueId: annotationQueueId,
        projectId,
        seenItemIds,
      });
      setNextItemData(nextItem);
    } catch (error) {
      if (error instanceof LangfuseNotFoundError) {
        setReferencedItemNotFound(true);
      }
    }
  };

  useEffect(() => {
    async function fetchNextItem() {
      if (!itemId && !isSingleItem) {
        await fetchAndLockNextItem();
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

  const totalItems = useMemo(() => {
    return seenItemIds.length + (unseenPendingItemCount.data ?? 0);
  }, [unseenPendingItemCount.data, seenItemIds.length]);

  const configs = queueData.data?.scoreConfigs ?? [];

  const relevantItem: QueueItemType | null | undefined = useMemo(() => {
    let item;
    if (isSingleItem) item = seenItemData.data?.item;
    else
      item =
        progressIndex < seenItemIds.length
          ? seenItemData.data?.item
          : nextItemData?.item;
    return item ? { parentTraceId: null, ...item } : null;
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
    referencedItemNotFound ||
    seenItemData.data?.error?.code === "NOT_FOUND" ||
    fetchAndLockNextMutation.data?.error?.code === "NOT_FOUND"
  )
    return (
      <div className="grid h-full grid-rows-[1fr,auto] gap-4 overflow-hidden">
        <div className="flex max-h-full min-h-0 w-full flex-col items-center justify-center">
          <ErrorPage
            title="Referenced trace or observation not found."
            message="The trace or observation has likely been deleted."
            additionalButton={{
              label: "Retry",
              onClick: () => void window.location.reload(),
            }}
          />
        </div>
        <AnnotationQueueItemFooter
          projectId={projectId}
          isSingleItem={isSingleItem}
          progressIndex={progressIndex}
          setProgressIndex={setProgressIndex}
          totalItems={totalItems}
          fetchAndLockNextItem={fetchAndLockNextItem}
          seenItemIds={seenItemIds}
          relevantItem={relevantItem}
        />
      </div>
    );

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
      <AnnotationQueueItemFooter
        projectId={projectId}
        isSingleItem={isSingleItem}
        progressIndex={progressIndex}
        setProgressIndex={setProgressIndex}
        totalItems={totalItems}
        fetchAndLockNextItem={fetchAndLockNextItem}
        seenItemIds={seenItemIds}
        relevantItem={relevantItem}
      />
    </div>
  );
};
