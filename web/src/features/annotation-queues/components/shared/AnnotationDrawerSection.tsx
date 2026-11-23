import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/design-system/Badge/Badge";
import { ScoreBadge } from "@/src/components/ScoreBadge/ScoreBadge";
import { ScoreTag, scoreLevelFromScore } from "@/src/components/ScoreTag";
import { selectReadOnlyItemScores } from "@/src/features/annotation-queues/lib/readOnlyItemScores";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import type {
  AnnotationCommentFlush,
  ScoreTarget,
} from "@/src/features/scores/types";
import {
  type AnnotationQueueItem,
  type ScoreDomain,
  isPresent,
  type ScoreConfigDomain,
} from "@langfuse/shared";
import { TriangleAlertIcon } from "@langfuse/icons";
import { useSession } from "next-auth/react";
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
  isV4: boolean;
  commentFlushRef?: React.Ref<AnnotationCommentFlush>;
}

export const AnnotationDrawerSection: React.FC<
  AnnotationDrawerSectionProps
> = ({
  item,
  scoreTarget,
  scores,
  configs,
  environment,
  isV4,
  commentFlushRef,
}) => {
  const session = useSession();

  const isLockedByOtherUser = item.lockedByUserId !== session.data?.user?.id;
  const readOnlyScores = selectReadOnlyItemScores(scores, scoreTarget, configs);

  return (
    <Card className="col-span-2 flex h-full flex-col overflow-y-auto border-none p-3 [--annotation-surface:var(--card)]">
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
          isV4,
        }}
        commentFlushRef={commentFlushRef}
        actionButtons={
          isLockedByOtherUser && isPresent(item.lockedByUser?.name) ? (
            <div className="border-dark-red bg-light-red flex items-center justify-center rounded-sm border p-1">
              <TriangleAlertIcon
                size="base"
                __rawClassName="text-dark-red mr-1"
              />
              <span className="text-dark-red text-xs">
                Currently edited by {item.lockedByUser.name}
              </span>
            </div>
          ) : undefined
        }
      />
      {readOnlyScores.length > 0 ? (
        <section
          aria-label="Other scores"
          className="mt-4 flex flex-col gap-2 border-t pt-3"
        >
          <h2 className="text-sm font-bold">Other scores</h2>
          <p className="text-muted-foreground text-xs">
            Eval, API, and annotation scores outside this queue. Read-only.
          </p>
          <ul className="ph-no-capture flex flex-col gap-2">
            {readOnlyScores.map((score) => (
              <li
                key={score.id}
                className="flex min-w-0 flex-wrap items-center gap-1"
              >
                <ScoreTag level={scoreLevelFromScore(score)} />
                <ScoreBadge name={score.name} scores={[score]} />
                <Badge
                  color="outline"
                  size="md"
                  label="Source"
                  text={score.source}
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </Card>
  );
};
