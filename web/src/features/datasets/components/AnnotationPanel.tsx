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
import { useScoreWriteCache } from "@/src/features/datasets/contexts/ScoreWriteCache";
import { transformSingleValueAggregateScoreData } from "@/src/features/datasets/lib/score-write-cache/filterSingleValueAggregates";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { useEmptyConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { api } from "@/src/utils/api";
import {
  type CreateAnnotationScoreData,
  type UpdateAnnotationScoreData,
} from "@langfuse/shared";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

export const AnnotationPanel = ({ projectId }: { projectId: string }) => {
  const [hasCommentDraft, setHasCommentDraft] = useState(false);
  const { activeCell, clearActiveCell } = useActiveCell();
  const { cacheCreate, cacheUpdate, cacheDelete } = useScoreWriteCache();

  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-compare-${projectId}`,
    60,
  );

  const configsData = api.scoreConfigs.all.useQuery({
    projectId,
  });

  const scores = useMemo(() => {
    if (!Boolean(configsData.data?.configs.length) || !activeCell) return [];
    return transformSingleValueAggregateScoreData(
      activeCell.singleValueAggregate,
      configsData.data?.configs ?? [],
      activeCell.traceId,
      activeCell.observationId ?? null,
    );
  }, [activeCell, configsData.data?.configs]);

  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyConfigs();

  const onMutateCallbacks = useMemo(
    () => ({
      onScoreCreate: (scoreId: string, score: CreateAnnotationScoreData) => {
        cacheCreate(scoreId, score);
      },
      onScoreUpdate: (scoreId: string, score: UpdateAnnotationScoreData) => {
        cacheUpdate(scoreId, score);
      },
      onScoreDelete: (scoreId: string) => {
        cacheDelete(scoreId);
      },
    }),
    [cacheCreate, cacheUpdate, cacheDelete],
  );

  if (!activeCell) {
    return <Skeleton className="h-full w-full" />;
  }

  return (
    <ResizablePanelGroup
      direction="vertical"
      onLayout={(sizes) => setVerticalSize(sizes[0])}
      className="h-full"
    >
      <ResizablePanel
        className="w-full overflow-y-auto p-2"
        minSize={30}
        defaultSize={verticalSize}
      >
        {configsData.data && activeCell ? (
          <AnnotateDrawerContent
            key={`annotation-drawer-content-${activeCell.traceId}-${activeCell.observationId}`}
            scoreTarget={{
              type: "trace",
              traceId: activeCell.traceId,
              observationId: activeCell.observationId,
            }}
            scores={scores}
            configs={configsData.data.configs}
            emptySelectedConfigIds={emptySelectedConfigIds}
            setEmptySelectedConfigIds={setEmptySelectedConfigIds}
            projectId={projectId}
            analyticsData={{
              type: "trace",
              source: "DatasetCompare",
            }}
            environment={activeCell.environment}
            onMutateCallbacks={onMutateCallbacks}
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
        ) : (
          <Skeleton className="h-full w-full" />
        )}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel className="overflow-y-auto" minSize={20}>
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
