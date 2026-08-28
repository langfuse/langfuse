import { Drawer } from "@/src/components/ui/drawer";
import { ActionButtonCountBadge } from "@/src/components/ui/action-button-count-badge";
import { Button, type ButtonProps } from "@/src/components/ui/button";
import { usePostHogClientCapture } from "@/src/features/posthog-analytics/usePostHogClientCapture";
import { useHasProjectAccess } from "@/src/features/rbac/utils/checkProjectAccess";
import {
  type AnalyticsData,
  type ScoreTarget,
} from "@/src/features/scores/types";
import { type ReactNode, useState } from "react";
import { AnnotateDrawerContent } from "@/src/features/scores/components/AnnotateDrawerContent";
import { type ScoreDomain } from "@langfuse/shared";
import { type WithStringifiedMetadata } from "@/src/utils/clientSideDomainTypes";
import { LockIcon, SquarePen } from "lucide-react";

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

type AnnotateDrawerToolbarButtonProps = {
  annotationCount: number;
  buttonVariant: NonNullable<ButtonProps["variant"]>;
  disabled: boolean;
  onClick: () => void;
  showAnnotationCount: boolean;
  size: NonNullable<ButtonProps["size"]>;
};

export function AnnotateDrawerToolbarButton({
  annotationCount,
  buttonVariant,
  disabled,
  onClick,
  showAnnotationCount,
  size,
}: AnnotateDrawerToolbarButtonProps) {
  return (
    <Button
      variant={buttonVariant}
      size={size}
      disabled={disabled}
      className="rounded-r-none"
      onClick={onClick}
    >
      {disabled ? (
        <LockIcon className="mr-1.5 h-3 w-3" />
      ) : (
        <SquarePen
          className={size === "sm" ? "mr-1.5 h-3.5 w-3.5" : "mr-1.5 h-4 w-4"}
        />
      )}
      <span>Annotate</span>
      {showAnnotationCount && annotationCount > 0 ? (
        <span className="ml-1">
          <ActionButtonCountBadge count={annotationCount} />
        </span>
      ) : null}
    </Button>
  );
}

type AnnotateDrawerMenuButtonProps = {
  annotationCount: number;
  disabled: boolean;
  onClick: () => void;
  showAnnotationCount: boolean;
};

export function AnnotateDrawerMenuButton({
  annotationCount,
  disabled,
  onClick,
  showAnnotationCount,
}: AnnotateDrawerMenuButtonProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={disabled}
      className="w-full justify-start gap-2 font-normal"
      onClick={onClick}
    >
      {disabled ? (
        <LockIcon className="h-3 w-3" />
      ) : (
        <SquarePen className="h-4 w-4" />
      )}
      <span className="text-sm">Annotate</span>
      {showAnnotationCount && annotationCount > 0 ? (
        <span className="ml-1">
          <ActionButtonCountBadge count={annotationCount} />
        </span>
      ) : null}
    </Button>
  );
}

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
