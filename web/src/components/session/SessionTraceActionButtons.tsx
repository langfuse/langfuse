/* eslint-disable @repo/no-style-props */
import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button } from "@/src/components/ui/button";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerController } from "@/src/features/comments/CommentDrawerController";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { AnnotationQueueItemCountBadge } from "@/src/features/annotation-queues/components/AnnotationQueueItemCountBadge";
import { cn } from "@/src/utils/tailwind";
import { ChevronDown, MessageSquare, MessageSquareOff } from "lucide-react";

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

  return (
    <div className={cn("flex flex-wrap items-start gap-2", className)}>
      <NewDatasetItemFromTraceId
        projectId={projectId}
        traceId={traceId}
        timestamp={timestamp}
        buttonVariant="outline"
        size={size}
      />
      <div className="flex items-start">
        <AnnotateDrawer
          key={`annotation-drawer-${traceId}`}
          projectId={projectId}
          scoreTarget={{
            type: "trace",
            traceId,
          }}
          scores={scores}
          buttonVariant="outline"
          size={size}
          analyticsData={{
            type: "trace",
            source: "SessionDetail",
          }}
          scoreMetadata={{
            projectId,
            environment: environment ?? undefined,
          }}
        />
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
                <AnnotationQueueItemCountBadge
                  totalCount={totalCount}
                  layout="toolbar"
                />
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
