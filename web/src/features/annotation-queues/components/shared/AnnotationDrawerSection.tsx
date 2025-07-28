import { Card } from "@/src/components/ui/card";
import useSessionStorage from "@/src/components/useSessionStorage";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { type ScoreTarget } from "@/src/features/scores/types";
import {
  type AnnotationQueueItem,
  type APIScoreV2,
  isPresent,
  type ValidatedScoreConfig,
} from "@langfuse/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { useMemo, useState } from "react";
import { CommentsSection } from "./CommentsSection";

interface AnnotationDrawerSectionProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  scoreTarget: ScoreTarget;
  scores: APIScoreV2[];
  configs: ValidatedScoreConfig[];
  environment?: string;
}

export const AnnotationDrawerSection: React.FC<
  AnnotationDrawerSectionProps
> = ({ item, scoreTarget, scores, configs, environment }) => {
  const router = useRouter();
  const session = useSession();
  const projectId = router.query.projectId as string;
  const [showSaving, setShowSaving] = useState(false);
  const [showComments, setShowComments] = useSessionStorage(
    `annotationQueueShowComments-${projectId}`,
    false,
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
      <div className="grid h-full w-full grid-cols-1 grid-rows-[minmax(auto,1fr),minmax(min-content,auto)] justify-between">
        <div className="w-full overflow-auto">
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
        </div>
        <div className="relative max-h-64 overflow-auto">
          <CommentsSection
            projectId={item.projectId}
            objectId={item.objectId}
            objectType={item.objectType}
            showComments={showComments}
            onToggleComments={setShowComments}
          />
        </div>
      </div>
    </Card>
  );
};
