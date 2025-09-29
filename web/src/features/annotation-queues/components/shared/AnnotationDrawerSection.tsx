import { Card } from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import useSessionStorage from "@/src/components/useSessionStorage";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { type ScoreTarget } from "@/src/features/scores/types";
import {
  type AnnotationQueueItem,
  type APIScoreV2,
  isPresent,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useMemo, useState } from "react";
import { CommentsSection } from "./CommentsSection";

interface AnnotationDrawerSectionProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  scoreTarget: ScoreTarget;
  scores: APIScoreV2[];
  configs: ScoreConfigDomain[];
  environment?: string;
  onHasCommentDraftChange?: (hasDraft: boolean) => void;
}

export const AnnotationDrawerSection: React.FC<
  AnnotationDrawerSectionProps
> = ({
  item,
  scoreTarget,
  scores,
  configs,
  environment,
  onHasCommentDraftChange,
}) => {
  const session = useSession();
  const [showSaving, setShowSaving] = useState(false);
  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-${item.projectId}`,
    60,
  );

  const isLockedByOtherUser = item.lockedByUserId !== session.data?.user?.id;

  const emptySelectedConfigIds = useMemo(() => {
    return configs.map((c) => c.id);
  }, [configs]);

  const handleSavingChange = (saving: boolean) => {
    setShowSaving(saving);
  };

  return (
    <Card className="col-span-2 flex h-full flex-col overflow-hidden">
      <ResizablePanelGroup
        direction="vertical"
        onLayout={(sizes) => setVerticalSize(sizes[0])}
      >
        <ResizablePanel
          className="w-full overflow-y-auto"
          minSize={30}
          defaultSize={verticalSize}
        >
          <AnnotateDrawerContent
            key={"annotation-drawer-content" + item.objectId}
            scoreTarget={scoreTarget}
            scores={scores}
            configs={configs}
            emptySelectedConfigIds={emptySelectedConfigIds}
            setEmptySelectedConfigIds={() => {}}
            projectId={item.projectId}
            analyticsData={{
              type: scoreTarget.type,
              source: "AnnotationQueue",
            }}
            isSelectHidden
            queueId={item.queueId}
            showSaving={showSaving}
            setShowSaving={handleSavingChange}
            environment={environment}
            actionButtons={
              isLockedByOtherUser && isPresent(item.lockedByUser?.name) ? (
                <div className="flex items-center justify-center rounded-sm border border-dark-red bg-light-red p-1">
                  <TriangleAlertIcon className="mr-1 h-4 w-4 text-dark-red" />
                  <span className="text-xs text-dark-red">
                    Currently edited by {item.lockedByUser.name}
                  </span>
                </div>
              ) : undefined
            }
            isDrawerOpen={true}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel className="overflow-y-auto" minSize={20}>
          <CommentsSection
            projectId={item.projectId}
            objectId={item.objectId}
            objectType={item.objectType}
            onDraftChange={(draft) => {
              onHasCommentDraftChange?.(draft);
            }}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </Card>
  );
};
