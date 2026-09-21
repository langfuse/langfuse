import { useHasProjectAccess } from "@/src/features/rbac";
import { DrawerContent, DrawerController } from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  type ScoreTarget,
  type AnnotationPanelData,
} from "@/src/features/scores/types";
import { type ReactNode } from "react";
import { getAnnotationTargetType } from "@/src/features/scores/lib/annotationAnalytics";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { AnnotationPanelContent } from "./AnnotationPanelContent";
import { useTraceReviewPanelOptional } from "@/src/features/traces/contexts/TraceReviewPanelContext";

export type AnnotateDrawerControllerProps<Target extends ScoreTarget> = {
  children: (control: {
    disabled: boolean;
    openDrawer: (payload: AnnotateDrawerPayload<Target>) => void;
  }) => ReactNode;
  projectId: string;
};

type AnnotateDrawerState = AnnotationPanelData;

type AnnotateDrawerPayload<Target extends ScoreTarget> =
  Target extends Extract<ScoreTarget, { type: "trace" }>
    ? Omit<AnnotateDrawerState, "scoreTarget" | "scores"> & {
        scoreTarget: Target;
        scores?: WithStringifiedMetadata<ScoreDomain>[];
      }
    : Omit<AnnotateDrawerState, "scoreTarget" | "scores"> & {
        scoreTarget: Target;
        scores: WithStringifiedMetadata<ScoreDomain>[];
      };

export function AnnotateDrawerController<Target extends ScoreTarget>({
  children,
  projectId,
}: AnnotateDrawerControllerProps<Target>) {
  const capture = usePostHogClientCapture();
  const reviewPanel = useTraceReviewPanelOptional();
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const disabled = !hasAccess;

  return (
    <DrawerController<AnnotateDrawerState>
      renderContent={({ state }) => (
        <DrawerContent className="overflow-y-auto p-3 [--annotation-surface:var(--modal)]">
          <AnnotationPanelContent data={state} actionButtons={null} isActive />
        </DrawerContent>
      )}
    >
      {({ openDrawer }) =>
        children({
          disabled,
          openDrawer: (payload) => {
            if (disabled) return;

            capture("annotation:entry_click", {
              ...payload.analyticsData,
              targetType: getAnnotationTargetType(payload.scoreTarget),
              entryPoint: "annotate_button",
            });
            if (reviewPanel) {
              reviewPanel
                .getState()
                .actions.rememberTrigger(
                  document.activeElement instanceof HTMLElement
                    ? document.activeElement
                    : null,
                );
              reviewPanel.getState().actions.openAnnotation(payload);
            } else openDrawer(payload);
          },
        })
      }
    </DrawerController>
  );
}
