import { Button } from "@/src/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import useSessionStorage from "@/src/components/useSessionStorage";
import { CommentsSection } from "@/src/features/annotation-queues/components/shared/CommentsSection";
import { useActiveCell } from "@/src/features/datasets/contexts/ActiveCellContext";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { decomposeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";

export const AnnotationPanel = ({ projectId }: { projectId: string }) => {
  const [hasCommentDraft, setHasCommentDraft] = useState(false);
  const { activeCell, clearActiveCell } = useActiveCell();

  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-compare-${projectId}`,
    60,
  );

  if (!activeCell) {
    return <Skeleton className="h-full w-full" />;
  }

  const hasNonAnnotationScores = Object.keys(activeCell.scoreAggregates).some(
    (key) => {
      const { source } = decomposeAggregateScoreKey(key);
      return source !== "ANNOTATION";
    },
  );

  return (
    <ResizablePanelGroup
      orientation="vertical"
      className="h-full"
      onLayoutChanged={(layout) => {
        const top = layout["annotation-top"];
        if (top != null) setVerticalSize(top);
      }}
    >
      <ResizablePanel
        id="annotation-top"
        className="w-full overflow-y-auto p-2"
        minSize="30%"
        defaultSize={`${verticalSize}%`}
      >
        {activeCell ? (
          <>
            <AnnotationForm
              key={`annotation-drawer-content-${activeCell.traceId}-${activeCell.observationId}`}
              scoreTarget={{
                type: "trace",
                traceId: activeCell.traceId,
                observationId: activeCell.observationId,
              }}
              serverScores={activeCell.scoreAggregates}
              analyticsData={{
                type: "trace",
                source: "DatasetCompare",
              }}
              scoreMetadata={{
                projectId,
                environment: activeCell.environment,
              }}
              actionButtons={
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    if (hasCommentDraft)
                      toast.error(
                        "Please save or discard your comment before proceeding",
                      );
                    else clearActiveCell();
                  }}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              }
            />
            {hasNonAnnotationScores && (
              <div className="mt-4 text-xs text-muted-foreground">
                API and eval scores visible on left. Add manual annotations
                above.
              </div>
            )}
          </>
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel className="overflow-y-auto" minSize="20%">
        <CommentsSection
          projectId={projectId}
          objectId={activeCell.observationId ?? activeCell.traceId}
          objectType={activeCell.observationId ? "OBSERVATION" : "TRACE"}
          onDraftChange={(draft) => {
            setHasCommentDraft(draft);
          }}
        />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
};
