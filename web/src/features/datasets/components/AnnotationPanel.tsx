import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import { Skeleton } from "@/src/components/ui/skeleton";
import useLocalStorage from "@/src/components/useLocalStorage";
import useSessionStorage from "@/src/components/useSessionStorage";
import { CommentsSection } from "@/src/features/annotation-queues/components/shared/CommentsSection";
import { useActiveCell } from "@/src/features/datasets/contexts/ActiveCellContext";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
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
  const [emptySelectedConfigIds, setEmptySelectedConfigIds] = useLocalStorage<
    string[]
  >("emptySelectedConfigIds", []);

  const configsData = api.scoreConfigs.all.useQuery({
    projectId,
  });

  // if hasCommentDraft do not allow closing the panel

  console.log("activeCell", activeCell);

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
          scores={[]} // TODO: populate
          configs={configsData.data?.configs ?? []}
          emptySelectedConfigIds={emptySelectedConfigIds}
          setEmptySelectedConfigIds={setEmptySelectedConfigIds}
          projectId={projectId}
          analyticsData={{
            type: "trace",
            source: "DatasetCompare",
          }}
          showSaving={showSaving}
          setShowSaving={setShowSaving}
          // environment={environment} // TODO: populate
          isDrawerOpen
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
