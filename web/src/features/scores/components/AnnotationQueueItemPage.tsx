import { Trace } from "@/src/components/trace";
import { ObservationPreview } from "@/src/components/trace/ObservationPreview";
import { TracePreview } from "@/src/components/trace/TracePreview";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import useSessionStorage from "@/src/components/useSessionStorage";
import { showSuccessToast } from "@/src/features/notifications/showSuccessToast";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { api } from "@/src/utils/api";
import {
  type AnnotationQueueItem,
  AnnotationQueueObjectType,
  AnnotationQueueStatus,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useRouter } from "next/router";
import { useEffect, useMemo, useRef } from "react";
import { StringParam, useQueryParam } from "use-query-params";

const AnnotateIOView = ({
  item,
  configs,
  isViewOnly,
  view,
}: {
  item: AnnotationQueueItem & { parentObjectId?: string | null };
  configs: ValidatedScoreConfig[];
  isViewOnly: boolean;
  view: "showTree" | "hideTree";
}) => {
  const router = useRouter();
  const traceId = item.parentObjectId ?? item.objectId;
  const projectId = router.query.projectId as string;
  const [panelSize, setPanelSize] = useSessionStorage(
    `annotationQueuePanelSize-${projectId}`,
    65,
  );
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_, setCurrentObservationId] = useQueryParam(
    "observation",
    StringParam,
  );

  const trace = api.traces.byIdWithObservationsAndScores.useQuery(
    { traceId, projectId },
    {
      retry(failureCount, error) {
        if (error.data?.code === "UNAUTHORIZED") return false;
        return failureCount < 3;
      },
    },
  );

  if (trace.isLoading || !trace.data) return <div>Loading...</div>;

  if (view === "showTree") {
    if (item.objectType === AnnotationQueueObjectType.OBSERVATION)
      setCurrentObservationId(item.objectId);
    else setCurrentObservationId(undefined);
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
        className="col-span-1 h-full !overflow-y-auto"
        minSize={30}
        defaultSize={panelSize}
      >
        {view === "hideTree" ? (
          item.objectType === AnnotationQueueObjectType.TRACE ? (
            <TracePreview
              key={trace.data.id}
              trace={trace.data}
              scores={trace.data.scores}
              observations={trace.data.observations}
              viewType="focused"
              className="h-full"
            />
          ) : (
            <ObservationPreview
              observations={trace.data.observations}
              scores={trace.data.scores}
              projectId={item.projectId}
              currentObservationId={item.objectId}
              traceId={traceId}
              viewType="focused"
              className="h-full"
            />
          )
        ) : (
          <Card className="col-span-2 flex h-full flex-col overflow-hidden p-2">
            <Trace
              key={trace.data.id}
              trace={trace.data}
              scores={trace.data.scores}
              projectId={trace.data.projectId}
              observations={trace.data.observations}
              viewType="focused"
            />
          </Card>
        )}
      </ResizablePanel>
      <ResizableHandle withHandle className="ml-4 bg-transparent" />
      <ResizablePanel
        className="col-span-1 h-full md:flex md:flex-col md:overflow-hidden"
        minSize={30}
      >
        <Card className="col-span-2 flex h-full flex-col overflow-hidden">
          {/* TODO: ensure configs keep their order */}
          <AnnotateDrawerContent
            key={"annotation-drawer-content" + item.objectId}
            traceId={traceId}
            scores={trace.data?.scores ?? []}
            observationId={item.parentObjectId ? item.objectId : undefined}
            configs={configs}
            emptySelectedConfigIds={configs.map((c) => c.id)}
            setEmptySelectedConfigIds={() => {}}
            projectId={item.projectId}
            type={item.objectType.toLowerCase() as "trace" | "observation"}
            isViewOnly={isViewOnly}
            isSelectHidden
            queueId={item.queueId}
          />
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};

export const AnnotationQueueItemPage: React.FC<{
  annotationQueueId: string;
  projectId: string;
  view: "showTree" | "hideTree";
}> = ({ annotationQueueId, projectId, view }) => {
  const router = useRouter();
  const isViewOnly = useRef<boolean>(false);

  const [seenItemIds, setSeenItemIds] = useSessionStorage<string[]>(
    `seenItemIds-${annotationQueueId}`,
    [],
  );
  const [progressIndex, setProgressIndex] = useSessionStorage<number>(
    `progressIndex-${annotationQueueId}`,
    0,
  );

  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "annotationQueues:CUD",
  });

  useEffect(() => {
    const viewOnlyParam = router.query.viewOnly;
    isViewOnly.current = viewOnlyParam === "true";
  }, [router.query.viewOnly]);

  const itemId = seenItemIds[progressIndex];

  const seenItemData = api.annotationQueueItems.byId.useQuery(
    { projectId, itemId: itemId as string },
    { enabled: !!itemId, refetchOnMount: false },
  );

  const nextItemData = api.annotationQueues.next.useQuery(
    {
      queueId: annotationQueueId,
      projectId,
    },
    {
      enabled: !itemId,
      refetchOnMount: false,
    },
  );

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

  // TODO: refetch after a few minutes
  const pendingItemIds = api.annotationQueues.pendingItemsByQueueId.useQuery({
    queueId: annotationQueueId,
    projectId,
  });

  const utils = api.useUtils();
  const completeMutation = api.annotationQueueItems.complete.useMutation({
    onSuccess: () => {
      utils.annotationQueueItems.invalidate();
      showSuccessToast({
        title: "Item marked as complete",
        description: "The item is successfully marked as complete.",
      });
    },
  });

  const totalItems = useMemo(() => {
    return [...new Set([...seenItemIds, ...(pendingItemIds.data ?? [])])]
      .length;
  }, [pendingItemIds.data, seenItemIds]);

  const configs = queueData.data?.scoreConfigs ?? [];

  const relevantItem = useMemo(
    () =>
      progressIndex < seenItemIds.length
        ? seenItemData.data
        : nextItemData.data,
    [progressIndex, seenItemIds.length, seenItemData.data, nextItemData.data],
  );

  useEffect(() => {
    if (relevantItem && router.query.itemId !== relevantItem.id) {
      router.push(
        {
          pathname: router.pathname,
          query: { ...router.query, itemId: relevantItem.id },
        },
        undefined,
        { shallow: true },
      );
    }
  }, [relevantItem, router]);

  useEffect(() => {
    if (relevantItem && !seenItemIds.includes(relevantItem.id)) {
      setSeenItemIds((prev) => [...prev, relevantItem.id]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [relevantItem]);

  if (
    (seenItemData.isLoading && itemId) ||
    (nextItemData.isLoading && !itemId)
  ) {
    return <div>Loading...</div>;
  }

  if (
    !relevantItem ||
    (pendingItemIds.data?.length === 0 && !isViewOnly.current)
  ) {
    return <div>No more items left to annotate!</div>;
  }

  const isNextItemAvailable =
    (nextItemData.data && totalItems > progressIndex + 1) ||
    progressIndex < seenItemIds.length - 1 ||
    progressIndex < (pendingItemIds.data?.length ?? 1) - 1;

  return (
    <div className="grid h-full grid-rows-[1fr,auto] gap-4 overflow-hidden">
      <AnnotateIOView
        item={relevantItem}
        configs={configs}
        isViewOnly={isViewOnly.current}
        view={view}
      />
      {!isViewOnly.current ? (
        <div className="grid h-full w-full grid-cols-1 justify-end gap-2 sm:grid-cols-[auto,min-content]">
          <div className="flex max-h-10 flex-row gap-2">
            <span className="grid h-9 min-w-16 items-center rounded-md bg-border p-1 text-center text-sm">
              {progressIndex + 1} / {totalItems}
            </span>
            <Button
              onClick={() => setProgressIndex(progressIndex - 1)}
              variant="outline"
              disabled={progressIndex === 0 || !hasAccess}
              size="lg"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex w-full min-w-[265px] justify-end gap-2">
            <Button
              onClick={async () => {
                setProgressIndex(Math.max(progressIndex + 1, 0));
                if (progressIndex >= seenItemIds.length) {
                  await nextItemData.refetch();
                }
              }}
              disabled={!isNextItemAvailable || !hasAccess}
              size="lg"
              className="w-full"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
            {relevantItem.status === AnnotationQueueStatus.PENDING && (
              <Button
                onClick={async () => {
                  if (!relevantItem) return;
                  await completeMutation.mutateAsync({
                    itemId: relevantItem.id,
                    projectId,
                  });
                }}
                size="lg"
                disabled={completeMutation.isLoading || !hasAccess}
              >
                Mark as complete
              </Button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-end">
          <span className="rounded-md bg-border p-2 text-sm text-muted-foreground">
            View only
          </span>
        </div>
      )}
    </div>
  );
};
