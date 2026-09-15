import { DrawerContent } from "@/src/components/ui/drawer";
import { AnnotationForm } from "@/src/features/scores/components/AnnotationForm";
import {
  type AnalyticsData,
  type ScoreTarget,
} from "@/src/features/scores/types";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

type AnnotateDrawerContentProps<Target extends ScoreTarget> = {
  analyticsData: AnalyticsData;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  scoreTarget: Target;
  scores: WithStringifiedMetadata<ScoreDomain>[];
};

export function AnnotateDrawerContent<Target extends ScoreTarget>({
  analyticsData,
  scoreMetadata,
  scoreTarget,
  scores,
}: AnnotateDrawerContentProps<Target>) {
  const hasNonAnnotationScores = scores.some(
    (score) => score.source !== "ANNOTATION",
  );

  return (
    <DrawerContent className="p-3">
      <AnnotationForm
        serverScores={scores}
        scoreTarget={scoreTarget}
        analyticsData={analyticsData}
        scoreMetadata={scoreMetadata}
      />
      {hasNonAnnotationScores ? (
        <div className="text-muted-foreground mt-4 text-xs">
          API and eval scores visible on left. Add manual annotations above.
        </div>
      ) : null}
    </DrawerContent>
  );
}
