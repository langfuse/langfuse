import { useHasProjectAccess } from "@/src/features/rbac";
import { Drawer } from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  type AnalyticsData,
  type ScoreTarget,
} from "@/src/features/scores/types";
import { type ReactNode, useState } from "react";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export type AnnotateDrawerControllerProps<Target extends ScoreTarget> = {
  analyticsData?: AnalyticsData;
  children: (control: {
    annotationCount: number;
    disabled: boolean;
    openDrawer: () => void;
  }) => ReactNode;
  projectId: string;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  scoreTarget: Target;
  scores: WithStringifiedMetadata<ScoreDomain>[];
};

export function AnnotateDrawerController<Target extends ScoreTarget>({
  analyticsData = {
    type: "trace",
    source: "TraceDetail",
  },
  children,
  projectId,
  scoreMetadata,
  scoreTarget,
  scores,
}: AnnotateDrawerControllerProps<Target>) {
  const [isOpen, setIsOpen] = useState(false);
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const annotationCount = scores.filter(
    (score) => score.source === "ANNOTATION",
  ).length;
  const disabled = !hasAccess;

  const openDrawer = () => {
    if (disabled) return;

    capture(
      scores.length ? "score:update_form_open" : "score:create_form_open",
      analyticsData,
    );
    setIsOpen(true);
  };

  return (
    <Drawer open={isOpen} onOpenChange={setIsOpen}>
      {children({ annotationCount, disabled, openDrawer })}
      <AnnotateDrawerContent
        analyticsData={analyticsData}
        scoreMetadata={scoreMetadata}
        scoreTarget={scoreTarget}
        scores={scores}
      />
    </Drawer>
  );
}
