import { useHasProjectAccess } from "@/src/identity/access-control";
import {
  DrawerContent,
  DrawerController,
  DrawerTitle,
} from "@/src/app/design-system/legacy-primitives/drawer";
import { usePostHogClientCapture } from "@/src/analytics/internal/posthog";
import { type ScoreTarget, type AnnotationPanelData } from "@/src/scores/types";
import { useRef, type ReactNode } from "react";
import { getAnnotationTargetType } from "@/src/scores/lib/annotationAnalytics";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/app/utils/clientSideDomainTypes";
import { AnnotationPanelContent } from "./AnnotationPanelContent";
import {
  useTraceReviewPanelOptional,
  useReviewPanelOpen,
} from "@/src/tracing/traces/contexts/TraceReviewPanelContext";
import { useIsMobile } from "@/src/app/hooks/use-mobile";

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
  const onOpen = useReviewPanelOpen();
  const capture = usePostHogClientCapture();
  const reviewPanel = useTraceReviewPanelOptional();
  const isMobile = useIsMobile();
  const triggerRef = useRef<HTMLElement | null>(null);
  const hasAccess = useHasProjectAccess({
    projectId,
    scope: "scores:save",
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
          {/* AnnotationPanelContent's visible "Annotate" header is a plain
              heading, so the drawer still needs its own Title element. */}
          <DrawerTitle className="sr-only">Annotate</DrawerTitle>
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
              onOpen?.("annotation");
            } else openDrawer(payload);
          },
        })
      }
    </DrawerController>
  );
}
