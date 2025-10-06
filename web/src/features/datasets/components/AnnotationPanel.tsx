import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import useSessionStorage from "@/src/components/useSessionStorage";
import { CommentsSection } from "@/src/features/annotation-queues/components/shared/CommentsSection";
import { useActiveCell } from "@/src/features/datasets/contexts/ActiveCellContext";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { useEmptyConfigs } from "@/src/features/scores/hooks/useEmptyConfigs";
import { decomposeAggregateScoreKey } from "@/src/features/scores/lib/aggregateScores";
import { type AnnotationScore } from "@/src/features/scores/types";
import { api } from "@/src/utils/api";
import { useState } from "react";

export const AnnotationPanel = ({ projectId }: { projectId: string }) => {
  const [showSaving, setShowSaving] = useState(false);
  const [hasCommentDraft, setHasCommentDraft] = useState(false);

  const { activeCell, clearActiveCell } = useActiveCell();
  // const { clearWrites } = useScoreWriteCache();

  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-compare-${projectId}`,
    60,
  );

  const configsData = api.scoreConfigs.all.useQuery({
    projectId,
  });

  const { emptySelectedConfigIds, setEmptySelectedConfigIds } =
    useEmptyConfigs();

  if (!activeCell) {
    return <Skeleton className="h-full w-full" />;
  }

  // TODO: review and fix this
  const scores: AnnotationScore[] = Object.entries(activeCell.scoreAggregate)
    .map(([key, score]) => {
      const { name, dataType, source } = decomposeAggregateScoreKey(key);
      if (source !== "ANNOTATION") {
        return null;
      }
      const baseScoreData = {
        id: score.id ?? null,
        name,
        dataType,
        source,
        comment: score.comment ?? undefined,
        configId:
          configsData.data?.configs.find((c) => c.name === name)?.id ?? null,
        traceId: activeCell.traceId,
        observationId: activeCell.observationId ?? null,
        sessionId: null,
      };

      if (score.type === "NUMERIC") {
        return {
          ...baseScoreData,
          stringValue: null,
          value: score.average,
        };
      }

      return {
        ...baseScoreData,
        // TODO: find solution for this, it's a hack
        value:
          configsData.data?.configs
            .find((c) => c.name === name)
            ?.categories?.find((c) => c.label === score.values[0])?.value ??
          null,
        stringValue: score.values[0],
      };
    })
    .filter((score) => score !== null);

  return (
    <ResizablePanelGroup
      direction="vertical"
      onLayout={(sizes) => setVerticalSize(sizes[0])}
      className="h-full"
    >
      <ResizablePanel
        className="w-full overflow-y-auto"
        minSize={30}
        defaultSize={verticalSize}
      >
        <AnnotateDrawerContent
          key={"annotation-drawer-content"}
          scoreTarget={{
            type: "trace",
            traceId: activeCell.traceId,
            observationId: activeCell.observationId,
          }}
          scores={scores}
          configs={configsData.data?.configs ?? []}
          emptySelectedConfigIds={emptySelectedConfigIds}
          setEmptySelectedConfigIds={setEmptySelectedConfigIds}
          projectId={projectId}
          analyticsData={{
            type: "trace",
            source: "DatasetCompare",
          }}
          environment={activeCell.environment}
        />
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
