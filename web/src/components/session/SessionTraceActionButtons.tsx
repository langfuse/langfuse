import { type RouterOutputs } from "@/src/utils/api";
import { getNumberFromMap } from "@/src/utils/map-utils";
import { AnnotateDrawer } from "@/src/features/scores/components/AnnotateDrawer";
import { CommentDrawerButton } from "@/src/features/comments/CommentDrawerButton";
import { NewDatasetItemFromTraceId } from "@/src/components/session/NewDatasetItemFromTrace";
import { CreateNewAnnotationQueueItem } from "@/src/features/annotation-queues/components/CreateNewAnnotationQueueItem";
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
        <CreateNewAnnotationQueueItem
          projectId={projectId}
          objectId={traceId}
          objectType="TRACE"
          variant="outline"
          size={size}
        />
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
