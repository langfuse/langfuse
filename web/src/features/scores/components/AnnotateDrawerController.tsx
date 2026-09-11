import { useHasProjectAccess } from "@/src/features/rbac";
import { DrawerController } from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  type AnalyticsData,
  type ScoreTarget,
} from "@/src/features/scores/types";
import { type ReactNode } from "react";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";

export type AnnotateDrawerControllerProps<Target extends ScoreTarget> = {
  children: (control: {
    disabled: boolean;
    openDrawer: (payload: AnnotateDrawerState<Target>) => void;
  }) => ReactNode;
  projectId: string;
};

type AnnotateDrawerState<Target extends ScoreTarget> = {
  analyticsData: AnalyticsData;
  scoreMetadata: {
    projectId: string;
    queueId?: string;
    environment?: string;
  };
  scoreTarget: Target;
  scores: WithStringifiedMetadata<ScoreDomain>[];
};

export function AnnotateDrawerController<Target extends ScoreTarget>({
  children,
  projectId,
}: AnnotateDrawerControllerProps<Target>) {
  const capture = usePostHogClientCapture();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const disabled = !hasAccess;

  return (
    <DrawerController<AnnotateDrawerState<Target>>
      renderContent={({ state }) => (
        <AnnotateDrawerContent
          analyticsData={state.analyticsData}
          scoreMetadata={state.scoreMetadata}
          scoreTarget={state.scoreTarget}
          scores={state.scores}
        />
      )}
    >
      {({ openDrawer }) =>
        children({
          disabled,
          openDrawer: (payload) => {
            if (disabled) return;

            capture(
              payload.scores.length
                ? "score:update_form_open"
                : "score:create_form_open",
              payload.analyticsData,
            );
            openDrawer(payload);
          },
        })
      }
    </DrawerController>
  );
}
