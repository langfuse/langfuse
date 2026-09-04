/* eslint-disable @repo/no-style-props */
import { api, type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button } from "@/src/components/ui/button";
import { AnnotateDrawerController } from "@/src/features/scores/components/AnnotateDrawerController";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { ExistingDatasetItemsDropdownMenuController } from "@/src/features/datasets/components/ExistingDatasetItemsDropdownMenuController";
import { NewDatasetItemFromExistingObjectDialogController } from "@/src/features/datasets/components/NewDatasetItemFromExistingObjectDialogController";
import { useDatasetItemFromTraceOrObservation } from "@/src/features/datasets/hooks/useDatasetItemFromTraceOrObservation";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { cn } from "@/src/utils/tailwind";
import {
  ChevronDown,
  LockIcon,
  MessageSquare,
  MessageSquareOff,
  PlusIcon,
  SquarePen,
} from "lucide-react";

type TraceScores =
  RouterOutputs["sessions"]["byIdWithScores"]["traces"][number]["scores"];

export function SessionTraceActionButtons({
  projectId,
  traceId,
  timestamp,
  environment,
  scores,
  traceCommentCounts,
  density = "default",
  className,
}: {
  projectId: string;
  traceId: string;
  timestamp: Date;
  environment?: string | null;
  scores: TraceScores;
  traceCommentCounts: Map<string, number> | undefined;
  density?: "default" | "compact";
  className?: string;
}) {
  const size = density === "compact" ? "xs" : "default";
  const commentCount = getNumberFromMap(traceCommentCounts, traceId);
  // SessionIO already fetches the trace, so this doesn't add an extra request
  const trace = api.traces.byId.useQuery(
    {
      traceId,
      projectId,
      timestamp,
    },
    {
      enabled: typeof traceId === "string",
      trpc: {
        context: {
          skipBatch: true,
        },
      },
      refetchOnMount: false,
    },
  );
  const {
    existingDatasetItems,
    hasAccess: hasDatasetAccess,
    captureNewDatasetItemFormOpen,
  } = useDatasetItemFromTraceOrObservation({
    projectId,
    traceId,
    enabled: Boolean(trace.data),
  });
  const datasetCount = existingDatasetItems.length;
  const hasExistingDatasetItems = datasetCount > 0;

  return (
    <div className={cn("flex flex-wrap items-start gap-2", className)}>
      {trace.data ? (
        <NewDatasetItemFromExistingObjectDialogController
          projectId={projectId}
          traceId={traceId}
          input={trace.data.input ?? null}
          output={trace.data.output ?? null}
          metadata={trace.data.metadata ?? null}
        >
          {({ openDialog }) => (
            <ExistingDatasetItemsDropdownMenuController
              projectId={projectId}
              datasetItems={existingDatasetItems}
              disabled={!hasDatasetAccess}
              onOpenDialog={openDialog}
            >
              {({ Anchor, openDropdown }) => (
                <Anchor>
                  <Button
                    onClick={() => {
                      if (hasExistingDatasetItems) {
                        openDropdown();
                        return;
                      }

                      captureNewDatasetItemFormOpen();
                      openDialog();
                    }}
                    variant={hasExistingDatasetItems ? "secondary" : "outline"}
                    size={size}
                    disabled={!hasDatasetAccess}
                  >
                    {!hasExistingDatasetItems && hasDatasetAccess ? (
                      <PlusIcon
                        className="mr-1.5 -ml-0.5 h-4 w-4"
                        aria-hidden="true"
                      />
                    ) : null}
                    {hasExistingDatasetItems
                      ? `In ${datasetCount} dataset(s)`
                      : "Add to datasets"}
                    {hasExistingDatasetItems ? (
                      <ChevronDown className="ml-2 h-3 w-3" />
                    ) : !hasDatasetAccess ? (
                      <LockIcon className="ml-1.5 h-3 w-3" aria-hidden="true" />
                    ) : null}
                  </Button>
                </Anchor>
              )}
            </ExistingDatasetItemsDropdownMenuController>
          )}
        </NewDatasetItemFromExistingObjectDialogController>
      ) : null}
      <div className="flex items-start">
        <AnnotateDrawerController
          key={`annotation-drawer-${traceId}`}
          projectId={projectId}
          scoreTarget={{
            type: "trace",
            traceId,
          }}
          scores={scores}
          analyticsData={{
            type: "trace",
            source: "SessionDetail",
          }}
          scoreMetadata={{
            projectId,
            environment: environment ?? undefined,
          }}
        >
          {({ disabled, openDrawer }) => (
            <Button
              variant="outline"
              size={size}
              disabled={disabled}
              className="rounded-r-none"
              onClick={openDrawer}
            >
              {disabled ? (
                <LockIcon className="mr-1.5 h-3 w-3" />
              ) : (
                <SquarePen className="mr-1.5 h-4 w-4" />
              )}
              <span>Annotate</span>
            </Button>
          )}
        </AnnotateDrawerController>
        <AnnotationQueueItemDropdownMenuController
          projectId={projectId}
          objectId={traceId}
          objectType="TRACE"
        >
          {({ disabled, totalCount }) => (
            <Button
              variant="outline"
              size={size}
              disabled={disabled !== undefined}
              className="rounded-l-none rounded-r-md border-l-2"
            >
              <span className="relative mr-1 text-xs">
                <ChevronDown className="h-3 w-3" />
                {totalCount > 0 && (
                  <AnnotationQueueItemCountBadge
                    totalCount={totalCount}
                    layout="toolbar"
                  />
                )}
              </span>
            </Button>
          )}
        </AnnotationQueueItemDropdownMenuController>
      </div>
      <CommentDrawerController
        projectId={projectId}
        objectId={traceId}
        objectType="TRACE"
        count={commentCount}
      >
        {({ disabled, openDrawer }) => (
          <Button
            type="button"
            variant="outline"
            size={size}
            disabled={disabled}
            onClick={openDrawer}
            className="gap-1"
          >
            {disabled ? (
              <MessageSquareOff className="text-muted-foreground h-4 w-4" />
            ) : (
              <>
                <MessageSquare className="h-4 w-4" />
                <span>Add comment</span>
                {!!commentCount ? (
                  <ActionButtonCountBadge count={commentCount} />
                ) : null}
              </>
            )}
          </Button>
        )}
      </CommentDrawerController>
    </div>
  );
}
