/* eslint-disable @repo/no-style-props */
import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { Button } from "@/src/components/ui/button";
import { AnnotationQueueItemDropdownMenuController } from "@/src/features/annotation-queues/components/AnnotationQueueItemDropdownMenuController";
import { ChevronDown } from "lucide-react";
import { cn } from "@/src/utils/tailwind";

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
                {totalCount > 0 ? (
                  <span className="bg-primary text-primary-foreground absolute -top-1 left-2.5 flex h-3 min-w-3 items-center justify-center rounded-sm px-0.5 text-[8px] font-bold shadow-xs">
                    {totalCount > 99 ? "99+" : totalCount}
                  </span>
                ) : null}
              </span>
            </Button>
          )}
        </AnnotationQueueItemDropdownMenuController>
      </div>
      <CommentDrawerButton
        projectId={projectId}
        variant="outline"
        objectId={traceId}
        objectType="TRACE"
        count={getNumberFromMap(traceCommentCounts, traceId)}
        size={size}
      />
    </div>
  );
}
