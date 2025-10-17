import { Card } from "@/src/components/ui/card";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/src/components/ui/resizable";
import useSessionStorage from "@/src/components/useSessionStorage";
import { type ScoreTarget } from "@/src/features/scores/types";
import {
  type AnnotationQueueItem,
  type APIScoreV2,
  isPresent,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { CommentsSection } from "./CommentsSection";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";

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
  const [verticalSize, setVerticalSize] = useSessionStorage(
    `annotationQueueDrawerVertical-${item.projectId}`,
    60,
  );

  const isLockedByOtherUser = item.lockedByUserId !== session.data?.user?.id;

  return (
    <Card className="col-span-2 flex h-full flex-col overflow-hidden">
      <ResizablePanelGroup
        direction="vertical"
        onLayout={(sizes) => setVerticalSize(sizes[0])}
      >
        <ResizablePanel
          className="w-full overflow-y-auto p-3"
          minSize={30}
          defaultSize={verticalSize}
        >
          <AnnotationForm
            key={"annotation-drawer-content" + item.objectId}
            scoreTarget={scoreTarget}
            serverScores={scores}
            configSelection={{ mode: "fixed", configs }}
            scoreMetadata={{
              projectId: item.projectId,
              queueId: item.queueId,
              environment,
            }}
            analyticsData={{
              type: scoreTarget.type,
              source: "AnnotationQueue",
            }}
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
