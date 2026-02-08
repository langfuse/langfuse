import { Card } from "@/src/components/ui/card";
import { type ScoreTarget } from "@/src/features/scores/types";
import {
  type AnnotationQueueItem,
  type ScoreDomain,
  isPresent,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { TriangleAlertIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

interface AnnotationDrawerSectionProps {
  item: AnnotationQueueItem & {
    parentTraceId?: string | null;
    lockedByUser: { name: string | null | undefined } | null;
  };
  scoreTarget: ScoreTarget;
  scores: WithStringifiedMetadata<ScoreDomain>[];
  configs: ScoreConfigDomain[];
  environment?: string;
}

export const AnnotationDrawerSection: React.FC<
  AnnotationDrawerSectionProps
> = ({ item, scoreTarget, scores, configs, environment }) => {
  const session = useSession();

  const isLockedByOtherUser = item.lockedByUserId !== session.data?.user?.id;

  const hasNonAnnotationScores = scores.some(
    (score) => score.source !== "ANNOTATION",
  );

  return (
    <Card className="col-span-2 flex h-full flex-col overflow-y-auto p-3">
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
      {hasNonAnnotationScores && (
        <div className="mt-4 text-xs text-muted-foreground">
          API and eval scores visible when toggling on the detailed view. Add
          manual annotations above.
        </div>
      )}
    </Card>
  );
};
