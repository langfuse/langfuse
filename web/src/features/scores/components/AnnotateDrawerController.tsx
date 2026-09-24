import { useHasProjectAccess } from "@/src/features/rbac";
import { DrawerContent, DrawerController } from "@/src/components/ui/drawer";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics";
import {
  type ScoreTarget,
  type AnnotationPanelData,
} from "@/src/features/scores/types";
import { useRef, type ReactNode } from "react";
import { getAnnotationTargetType } from "@/src/features/scores/lib/annotationAnalytics";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { AnnotationPanelContent } from "./AnnotationPanelContent";
import { useTraceReviewPanelOptional } from "@/src/features/traces/contexts/TraceReviewPanelContext";
import { useIsMobile } from "@/src/hooks/use-mobile";

export type AnnotateDrawerControllerProps<Target extends ScoreTarget> = {
  children: (control: {
    disabled: boolean;
    openDrawer: (payload: AnnotateDrawerPayload<Target>) => void;
  }) => ReactNode;
  projectId: string;
};

type AnnotateDrawerState = AnnotationPanelData;

export type AnnotateDrawerPayload<Target extends ScoreTarget> =
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
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLElement | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:CUD",
  });
  const disabled = !hasAccess;

  return (
    <DrawerController<AnnotateDrawerState>
      renderContent={({ state }) => (
        <DrawerContent
          className="[--annotation-surface:var(--modal)]"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (triggerRef.current?.isConnected)
              triggerRef.current.focus({ preventScroll: true });
          }}
        >
          <div className="min-h-0 overflow-y-auto overscroll-contain p-3">
            <AnnotationPanelContent
              data={state}
              actionButtons={null}
              isActive
            />
          </div>
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
            triggerRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
            // A phone uses the bottom sheet, whose height follows the form.
            if (reviewPanel && !isMobile) {
              reviewPanel
                .getState()
                .actions.rememberTrigger(triggerRef.current);
              reviewPanel.getState().actions.openAnnotation(payload);
            } else openDrawer(payload);
          },
        })
      }
    </DrawerController>
  );
}
