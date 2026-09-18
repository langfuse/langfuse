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
import {
  AnnotationForm,
  decomposeAggregateScoreKey,
} from "@/src/features/scores";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const AnnotationPanel = ({ projectId }: { projectId: string }) => {
  const { activeCell, clearActiveCell } = useActiveCell();
  if (!activeCell) return <Skeleton className="h-full w-full" />;
  return (
    <ActiveAnnotationPanel
      key={`${projectId}-${activeCell.traceId}-${activeCell.observationId}`}
      projectId={projectId}
      activeCell={activeCell}
      clearActiveCell={clearActiveCell}
    />
  );
};

function ActiveAnnotationPanel({
  projectId,
  activeCell,
  clearActiveCell,
}: {
  projectId: string;
  activeCell: NonNullable<ReturnType<typeof useActiveCell>["activeCell"]>;
  clearActiveCell: ReturnType<typeof useActiveCell>["clearActiveCell"];
}) {
  const [hasCommentDraft, setHasCommentDraft] = useState(false);
  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-compare-${projectId}`,
    60,
  );

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
        className="w-full overflow-y-auto p-2 [--annotation-surface:var(--modal)] md:[--annotation-surface:var(--background)]"
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
                isV4: false,
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
              <div className="text-muted-foreground mt-4 text-xs">
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
}
